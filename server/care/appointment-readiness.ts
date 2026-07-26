import {
  CARE_APPOINTMENT_REQUIRED_INPUT_LABELS,
  type CareAppointmentReadinessFacts,
  type CareAppointmentRequiredInputLabel,
} from "@shared/care/appointments";

export interface CareAppointmentReadinessResult {
  softwareReady: true;
  operationalReady: boolean;
  publicReady: boolean;
  requiredInputs: readonly CareAppointmentRequiredInputLabel[];
}

export function evaluateCareAppointmentReadiness(
  facts: CareAppointmentReadinessFacts,
): CareAppointmentReadinessResult {
  const requiredInputs: CareAppointmentRequiredInputLabel[] = [];
  if (!facts.medicalGroupVerified) {
    requiredInputs.push(CARE_APPOINTMENT_REQUIRED_INPUT_LABELS.medicalGroup);
  }
  if (!facts.clinicianRecordVerified) {
    requiredInputs.push(
      CARE_APPOINTMENT_REQUIRED_INPUT_LABELS.clinicianRecord,
    );
  }
  if (!facts.clinicianLicenseVerified) {
    requiredInputs.push(
      CARE_APPOINTMENT_REQUIRED_INPUT_LABELS.clinicianLicense,
    );
  }
  if (!facts.clinicianCredentialsVerified) {
    requiredInputs.push(
      CARE_APPOINTMENT_REQUIRED_INPUT_LABELS.clinicianCredentials,
    );
  }
  if (!facts.clinicianCoverageVerified) {
    requiredInputs.push(
      CARE_APPOINTMENT_REQUIRED_INPUT_LABELS.clinicianCoverage,
    );
  }
  if (!facts.supportedStateVerified) {
    requiredInputs.push(
      CARE_APPOINTMENT_REQUIRED_INPUT_LABELS.supportedState,
    );
  }
  if (!facts.telehealthProviderVerified) {
    requiredInputs.push(
      CARE_APPOINTMENT_REQUIRED_INPUT_LABELS.telehealthProvider,
    );
  }
  if (!facts.schedulingProviderVerified) {
    requiredInputs.push(
      CARE_APPOINTMENT_REQUIRED_INPUT_LABELS.schedulingProvider,
    );
  }
  if (!facts.remindersConfigured) {
    requiredInputs.push(CARE_APPOINTMENT_REQUIRED_INPUT_LABELS.reminders);
  }

  const operationalReady = requiredInputs.length === 0;
  if (!facts.publicActivationApproved) {
    requiredInputs.push(
      CARE_APPOINTMENT_REQUIRED_INPUT_LABELS.careActivation,
    );
  }
  return {
    softwareReady: true,
    operationalReady,
    publicReady: operationalReady && facts.publicActivationApproved,
    requiredInputs,
  };
}
