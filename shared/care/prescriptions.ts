import type { CareRecordId } from "./contracts";

export const CARE_PRESCRIPTION_STATUSES = [
  "draft",
  "signed",
  "superseded",
  "cancelled",
] as const;
export type CarePrescriptionStatus =
  (typeof CARE_PRESCRIPTION_STATUSES)[number];

export const CARE_PHARMACY_ORDER_STATUSES = [
  "pending_pharmacy",
  "received",
  "clarification_requested",
  "accepted",
  "rejected",
  "dispensed",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type CarePharmacyOrderStatus =
  (typeof CARE_PHARMACY_ORDER_STATUSES)[number];

export const CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS = {
  medicalGroup: "MEDICAL GROUP REQUIRED",
  clinicianCoverage: "CLINICIAN COVERAGE REQUIRED",
  prescriptionContent: "PATIENT-SPECIFIC PRESCRIPTION CONTENT REQUIRED",
  pharmacyPartner: "PHARMACY PARTNER REQUIRED",
  pharmacyIdentity: "PHARMACY LEGAL IDENTITY REQUIRED",
  pharmacyLicense: "PHARMACY LICENSE VERIFICATION REQUIRED",
  pharmacyStates: "PHARMACY SUPPORTED STATES REQUIRED",
  pharmacyAgreement: "EXECUTED PHARMACY AGREEMENT REQUIRED",
  pharmacyIntegration: "PHARMACY INTEGRATION REQUIRED",
  pharmacySupport: "PHARMACY SUPPORT CONTACT REQUIRED",
  careActivation: "CARE ACTIVATION APPROVAL REQUIRED",
} as const;

export type CarePrescriptionRequiredInputLabel =
  (typeof CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS)[keyof typeof CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS];

export interface CarePrescriptionReadinessFacts {
  medicalGroupVerified: boolean;
  clinicianCoverageVerified: boolean;
  patientSpecificContentVerified: boolean;
  pharmacyPartnerVerified: boolean;
  pharmacyIdentityVerified: boolean;
  pharmacyLicenseVerified: boolean;
  pharmacyStateCoverageVerified: boolean;
  pharmacyAgreementVerified: boolean;
  pharmacyIntegrationVerified: boolean;
  pharmacySupportVerified: boolean;
  publicActivationApproved: boolean;
}

export interface CarePrescription {
  id: CareRecordId;
  patientId: CareRecordId;
  appointmentId: CareRecordId;
  clinicianReviewId: CareRecordId;
  prescribingClinicianUserId: string;
  status: CarePrescriptionStatus;
  formulation: string | null;
  concentration: string | null;
  route: string | null;
  quantity: string | null;
  directions: string | null;
  refills: number | null;
  verifiedContentSourceId: CareRecordId | null;
  version: number;
  signedAt: string | null;
  supersedesPrescriptionId: CareRecordId | null;
}

export interface CarePharmacyOrder {
  id: CareRecordId;
  patientId: CareRecordId;
  prescriptionId: CareRecordId;
  assignedPharmacyId: CareRecordId;
  patientStateCode: string;
  status: CarePharmacyOrderStatus;
  clarificationOpen: boolean;
  trackingReferencePresent: boolean;
  version: number;
}
