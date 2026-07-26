import {
  CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS,
  type CarePharmacyOrder,
  type CarePharmacyOrderStatus,
  type CarePrescription,
  type CarePrescriptionReadinessFacts,
  type CarePrescriptionRequiredInputLabel,
} from "@shared/care/prescriptions";

export function evaluateCarePrescriptionReadiness(
  facts: CarePrescriptionReadinessFacts,
) {
  const requiredInputs: CarePrescriptionRequiredInputLabel[] = [];
  const checks: readonly [
    keyof CarePrescriptionReadinessFacts,
    CarePrescriptionRequiredInputLabel,
  ][] = [
    ["medicalGroupVerified", CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS.medicalGroup],
    ["clinicianCoverageVerified", CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS.clinicianCoverage],
    ["patientSpecificContentVerified", CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS.prescriptionContent],
    ["pharmacyPartnerVerified", CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS.pharmacyPartner],
    ["pharmacyIdentityVerified", CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS.pharmacyIdentity],
    ["pharmacyLicenseVerified", CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS.pharmacyLicense],
    ["pharmacyStateCoverageVerified", CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS.pharmacyStates],
    ["pharmacyAgreementVerified", CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS.pharmacyAgreement],
    ["pharmacyIntegrationVerified", CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS.pharmacyIntegration],
    ["pharmacySupportVerified", CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS.pharmacySupport],
  ];
  for (const [key, label] of checks) if (!facts[key]) requiredInputs.push(label);
  const operationalReady = requiredInputs.length === 0;
  if (!facts.publicActivationApproved) {
    requiredInputs.push(CARE_PRESCRIPTION_REQUIRED_INPUT_LABELS.careActivation);
  }
  return {
    softwareReady: true as const,
    operationalReady,
    publicReady: operationalReady && facts.publicActivationApproved,
    requiredInputs,
  };
}

export type CarePrescriptionGate =
  | { allowed: true; prescription: CarePrescription }
  | {
      allowed: false;
      reason:
        | "human_clinician_required"
        | "assigned_clinician_required"
        | "approved_review_required"
        | "verified_content_required"
        | "prescription_not_draft"
        | "supersession_target_required";
    };

export function signCarePrescription(input: {
  prescription: CarePrescription;
  actor: { subjectId: string; kind: "human_clinician" | "automation" | "ai" };
  reviewApproved: boolean;
  contentVerified: boolean;
  signedAt: string;
}): CarePrescriptionGate {
  if (input.actor.kind !== "human_clinician") {
    return { allowed: false, reason: "human_clinician_required" };
  }
  if (input.actor.subjectId !== input.prescription.prescribingClinicianUserId) {
    return { allowed: false, reason: "assigned_clinician_required" };
  }
  if (!input.reviewApproved) {
    return { allowed: false, reason: "approved_review_required" };
  }
  if (
    !input.contentVerified ||
    !input.prescription.verifiedContentSourceId ||
    [
      input.prescription.formulation,
      input.prescription.concentration,
      input.prescription.route,
      input.prescription.quantity,
      input.prescription.directions,
    ].some((value) => !value?.trim()) ||
    input.prescription.refills === null
  ) {
    return { allowed: false, reason: "verified_content_required" };
  }
  if (input.prescription.status !== "draft") {
    return { allowed: false, reason: "prescription_not_draft" };
  }
  return {
    allowed: true,
    prescription: {
      ...input.prescription,
      status: "signed",
      signedAt: input.signedAt,
      version: input.prescription.version + 1,
    },
  };
}

export type CarePharmacyOrderGate =
  | { allowed: true; order: CarePharmacyOrder }
  | {
      allowed: false;
      reason:
        | "assigned_pharmacy_required"
        | "pharmacy_role_required"
        | "pharmacy_state_coverage_required"
        | "invalid_pharmacy_transition"
        | "clarification_open"
        | "tracking_reference_required";
    };

const transitions: Readonly<
  Record<CarePharmacyOrderStatus, readonly CarePharmacyOrderStatus[]>
> = {
  pending_pharmacy: ["received", "rejected", "cancelled"],
  received: ["clarification_requested", "accepted", "rejected", "cancelled"],
  clarification_requested: [],
  accepted: ["clarification_requested", "dispensed", "cancelled"],
  rejected: [],
  dispensed: ["shipped"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function transitionCarePharmacyOrder(input: {
  order: CarePharmacyOrder;
  next: CarePharmacyOrderStatus;
  actor: {
    pharmacyId: string;
    hasPharmacyRole: boolean;
    stateCoverageVerified: boolean;
  };
  trackingReferencePresent?: boolean;
}): CarePharmacyOrderGate {
  if (!input.actor.hasPharmacyRole) {
    return { allowed: false, reason: "pharmacy_role_required" };
  }
  if (input.actor.pharmacyId !== input.order.assignedPharmacyId) {
    return { allowed: false, reason: "assigned_pharmacy_required" };
  }
  if (!input.actor.stateCoverageVerified) {
    return { allowed: false, reason: "pharmacy_state_coverage_required" };
  }
  if (!transitions[input.order.status].includes(input.next)) {
    return { allowed: false, reason: "invalid_pharmacy_transition" };
  }
  if (input.order.clarificationOpen && input.next === "dispensed") {
    return { allowed: false, reason: "clarification_open" };
  }
  const trackingReferencePresent =
    input.trackingReferencePresent ?? input.order.trackingReferencePresent;
  if (input.next === "shipped" && !trackingReferencePresent) {
    return { allowed: false, reason: "tracking_reference_required" };
  }
  return {
    allowed: true,
    order: {
      ...input.order,
      status: input.next,
      clarificationOpen:
        input.next === "clarification_requested"
          ? true
          : input.order.clarificationOpen,
      trackingReferencePresent,
      version: input.order.version + 1,
    },
  };
}

export type CareClarificationResolutionGate =
  | { allowed: true; order: CarePharmacyOrder }
  | {
      allowed: false;
      reason:
        | "assigned_clinician_or_admin_required"
        | "open_clarification_required"
        | "resolution_reference_required";
    };

export function resolveCarePharmacyClarification(input: {
  order: CarePharmacyOrder;
  prescribingClinicianUserId: string;
  actor: {
    subjectId: string;
    kind:
      | "human_clinician"
      | "clinical_admin"
      | "care_patient"
      | "pharmacy_operator";
  };
  resolutionReference: string;
}): CareClarificationResolutionGate {
  const authorized =
    input.actor.kind === "clinical_admin"
    || (
      input.actor.kind === "human_clinician"
      && input.actor.subjectId === input.prescribingClinicianUserId
    );
  if (!authorized) {
    return { allowed: false, reason: "assigned_clinician_or_admin_required" };
  }
  if (
    input.order.status !== "clarification_requested"
    || !input.order.clarificationOpen
  ) {
    return { allowed: false, reason: "open_clarification_required" };
  }
  if (!input.resolutionReference.trim()) {
    return { allowed: false, reason: "resolution_reference_required" };
  }
  return {
    allowed: true,
    order: {
      ...input.order,
      status: "received",
      clarificationOpen: false,
      version: input.order.version + 1,
    },
  };
}
