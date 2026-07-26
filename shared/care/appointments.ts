import type { CareRecordId } from "./contracts";

export const CARE_APPOINTMENT_STATUSES = [
  "requested",
  "scheduled",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type CareAppointmentStatus =
  (typeof CARE_APPOINTMENT_STATUSES)[number];

export const CARE_APPOINTMENT_ACTIONS = [
  "schedule",
  "reschedule",
  "cancel",
  "check_in",
  "complete",
  "no_show",
] as const;

export type CareAppointmentAction =
  (typeof CARE_APPOINTMENT_ACTIONS)[number];

export interface CareSchedulingStatus {
  providerConfigured: boolean;
  remindersConfigured: boolean;
  requestAvailable: boolean;
  reason:
    | "provider_unavailable"
    | "reminders_unavailable"
    | "ready";
}

export const CARE_APPOINTMENT_REQUIRED_INPUT_LABELS = {
  medicalGroup: "MEDICAL GROUP REQUIRED",
  clinicianRecord: "LICENSED CLINICIAN RECORD REQUIRED",
  clinicianLicense: "CLINICIAN LICENSE REQUIRED",
  clinicianCredentials: "CLINICIAN CREDENTIAL VERIFICATION REQUIRED",
  clinicianCoverage: "CLINICIAN COVERAGE REQUIRED",
  supportedState: "SUPPORTED STATE REQUIRED",
  telehealthProvider: "TELEHEALTH PROVIDER REQUIRED",
  schedulingProvider: "SCHEDULING PROVIDER REQUIRED",
  reminders: "APPOINTMENT REMINDER CONFIGURATION REQUIRED",
  careActivation: "CARE ACTIVATION APPROVAL REQUIRED",
} as const;

export type CareAppointmentRequiredInputLabel =
  (typeof CARE_APPOINTMENT_REQUIRED_INPUT_LABELS)[keyof typeof CARE_APPOINTMENT_REQUIRED_INPUT_LABELS];

export interface CareAppointmentReadinessFacts {
  medicalGroupVerified: boolean;
  clinicianRecordVerified: boolean;
  clinicianLicenseVerified: boolean;
  clinicianCredentialsVerified: boolean;
  clinicianCoverageVerified: boolean;
  supportedStateVerified: boolean;
  telehealthProviderVerified: boolean;
  schedulingProviderVerified: boolean;
  remindersConfigured: boolean;
  publicActivationApproved: boolean;
}

export interface CareAppointment {
  id: CareRecordId;
  patientId: CareRecordId;
  intakeId: CareRecordId;
  patientLocationId: CareRecordId;
  patientStateCode: string;
  assignedClinicianUserId: string | null;
  clinicianCoverageId: CareRecordId | null;
  status: CareAppointmentStatus;
  startsAt: string | null;
  endsAt: string | null;
  telehealthReady: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type CareAppointmentActor =
  | {
      kind: "patient";
      patientId: CareRecordId;
    }
  | {
      kind: "clinical_admin";
      subjectId: string;
    }
  | {
      kind: "human_clinician";
      subjectId: string;
      stateCoverageVerified: boolean;
    };

export interface CareAppointmentTransitionInput {
  appointment: CareAppointment;
  action: CareAppointmentAction;
  actor: CareAppointmentActor;
  startsAt?: string | null;
  endsAt?: string | null;
  telehealthReady?: boolean;
}

export interface CareAppointmentReminder {
  id: CareRecordId;
  appointmentId: CareRecordId;
  patientId: CareRecordId;
  dueAt: string;
  status: "pending" | "dispatched" | "cancelled" | "failed";
  templateKey: "care_appointment_reminder";
  occurredAt: string;
}

export interface CareTelehealthSessionStatus {
  configured: boolean;
  ready: boolean;
}
