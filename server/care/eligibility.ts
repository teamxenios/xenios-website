import type {
  CareEligibilityContext,
  CareEligibilityDecision,
} from "@shared/care/eligibility";

export function normalizeCareStateCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export function evaluateCareEligibility(
  context: CareEligibilityContext,
  evaluatedAt: Date,
): CareEligibilityDecision {
  const decision = (
    outcome: CareEligibilityDecision["outcome"],
    reason: CareEligibilityDecision["reason"],
    stateCode: string | null,
  ): CareEligibilityDecision => ({
    patientId: context.patientId,
    outcome,
    reason,
    stateCode,
    careEligibilityCleared: false,
    evaluatedAt: evaluatedAt.toISOString(),
    auditRequired: true,
  });

  if (!context.capabilityEnabled) {
    return decision("unavailable", "care_disabled", null);
  }
  if (
    !context.location ||
    context.location.patientId !== context.patientId
  ) {
    return decision("unavailable", "location_required", null);
  }

  const stateCode = normalizeCareStateCode(context.location.stateCode);
  if (!stateCode) {
    return decision("unavailable", "invalid_state", null);
  }
  if (
    !context.coverage ||
    normalizeCareStateCode(context.coverage.stateCode) !== stateCode
  ) {
    return decision("unavailable", "unsupported_state", stateCode);
  }
  if (!context.coverage.supportedStateActive) {
    return decision(
      context.coverage.waitlistEnabled ? "waitlist_available" : "unavailable",
      "unsupported_state",
      stateCode,
    );
  }
  if (!context.coverage.serviceCoverageActive) {
    return decision(
      context.coverage.waitlistEnabled ? "waitlist_available" : "unavailable",
      "service_unavailable",
      stateCode,
    );
  }
  if (context.coverage.activeClinicianCount < 1) {
    return decision(
      context.coverage.waitlistEnabled ? "waitlist_available" : "unavailable",
      "clinician_coverage_unavailable",
      stateCode,
    );
  }
  if (
    context.identity.patientId !== context.patientId ||
    context.identity.state !== "verified" ||
    !context.identity.verifiedAt
  ) {
    return decision("unavailable", "identity_unverified", stateCode);
  }
  if (
    !context.telehealthConsent.satisfied ||
    context.telehealthConsent.activeEvent?.patientId !== context.patientId
  ) {
    return decision(
      "consent_required",
      "telehealth_consent_required",
      stateCode,
    );
  }
  if (
    !context.privacyConsent.satisfied ||
    context.privacyConsent.activeEvent?.patientId !== context.patientId
  ) {
    return decision(
      "consent_required",
      "privacy_notice_required",
      stateCode,
    );
  }

  // This permits only an approved intake to begin. It is never treatment,
  // prescribing, or clinical eligibility clearance.
  return decision(
    "intake_available",
    "intake_foundation_ready",
    stateCode,
  );
}
