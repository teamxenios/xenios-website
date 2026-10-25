import {
  AUTH_ADMIN_ROLES,
  MEMBERSHIP_DECISION_REASON_CODES,
  MEMBERSHIP_DECISIONS,
  MEMBERSHIP_APPLICATION_STATES,
  type AuthAdminRole,
  type KernelResult,
  type MembershipApplication,
  type MembershipApplicationState,
  type MembershipAuditEvent,
  type MembershipDecision,
  type MembershipDecisionReasonCode,
  type NotificationIntent,
  type TurnstileAssessment,
} from "./contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function isCanonicalUtc(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function invalid<T>(message: string): KernelResult<T> {
  return { ok: false, code: "invalid_input", message };
}

function parseAssessment(value: unknown): TurnstileAssessment | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "verified",
    "action",
    "hostnameVerified",
    "assessedAt",
    "expiresAt",
    "errorCodes",
  ])) return null;
  if (
    typeof value.verified !== "boolean" ||
    value.action !== "membership_application" ||
    typeof value.hostnameVerified !== "boolean" ||
    !isCanonicalUtc(value.assessedAt) ||
    !isCanonicalUtc(value.expiresAt) ||
    !Array.isArray(value.errorCodes) ||
    !value.errorCodes.every((code) => typeof code === "string" && code.length > 0)
  ) return null;
  return value as unknown as TurnstileAssessment;
}

function parseApplication(value: unknown): MembershipApplication | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "applicationId",
    "accountId",
    "recipientEmail",
    "state",
    "createdAt",
    "updatedAt",
    "accessGranted",
    "checkoutEligible",
  ])) return null;
  if (
    !isUuid(value.applicationId) ||
    !isUuid(value.accountId) ||
    typeof value.recipientEmail !== "string" ||
    !EMAIL.test(value.recipientEmail) ||
    value.recipientEmail !== value.recipientEmail.toLowerCase() ||
    !MEMBERSHIP_APPLICATION_STATES.includes(value.state as MembershipApplicationState) ||
    !isCanonicalUtc(value.createdAt) ||
    !isCanonicalUtc(value.updatedAt) ||
    value.accessGranted !== false ||
    value.checkoutEligible !== false
  ) return null;
  return value as unknown as MembershipApplication;
}

function intent(
  application: MembershipApplication,
  template: NotificationIntent["template"],
  idempotencyKey: string,
): NotificationIntent {
  return {
    intentId: idempotencyKey,
    template,
    recipientEmail: application.recipientEmail,
    idempotencyKey,
    variables: {
      applicationReference: application.applicationId,
      nextState: application.state,
    },
  };
}
export function createMembershipApplication(
  rawInput: unknown,
  rawAssessment: unknown,
): KernelResult<Readonly<{
  application: MembershipApplication;
  notification: NotificationIntent;
  audit: MembershipAuditEvent;
}>> {
  if (!isRecord(rawInput) || !hasExactKeys(rawInput, [
    "applicationId",
    "accountId",
    "recipientEmail",
    "submittedAt",
    "idempotencyKey",
  ])) return invalid("Application input is malformed.");
  if (
    !isUuid(rawInput.applicationId) ||
    !isUuid(rawInput.accountId) ||
    !isUuid(rawInput.idempotencyKey) ||
    typeof rawInput.recipientEmail !== "string" ||
    !EMAIL.test(rawInput.recipientEmail.trim().toLowerCase()) ||
    !isCanonicalUtc(rawInput.submittedAt)
  ) return invalid("Application input is malformed.");

  const assessment = parseAssessment(rawAssessment);
  if (!assessment || !assessment.verified || !assessment.hostnameVerified || assessment.errorCodes.length > 0) {
    return { ok: false, code: "turnstile_required", message: "Human verification is required." };
  }
  if (assessment.assessedAt > rawInput.submittedAt || assessment.expiresAt < rawInput.submittedAt) {
    return { ok: false, code: "turnstile_expired", message: "Human verification expired." };
  }

  const application: MembershipApplication = {
    applicationId: rawInput.applicationId,
    accountId: rawInput.accountId,
    recipientEmail: rawInput.recipientEmail.trim().toLowerCase(),
    state: "submitted",
    createdAt: rawInput.submittedAt,
    updatedAt: rawInput.submittedAt,
    accessGranted: false,
    checkoutEligible: false,
  };
  return {
    ok: true,
    value: {
      application,
      notification: intent(application, "membership_application_received", rawInput.idempotencyKey),
      audit: {
        eventId: rawInput.idempotencyKey,
        applicationId: application.applicationId,
        actorPrincipalId: application.accountId,
        actorRole: "public_applicant",
        eventType: "application_submitted",
        occurredAt: application.createdAt,
      },
    },
  };
}

const DECISION_STATE: Record<MembershipDecision, MembershipApplicationState> = {
  approve: "approved_pending_activation",
  decline: "declined",
  request_documentation: "pending_documentation",
};

const DECISION_TEMPLATE: Record<MembershipDecision, NotificationIntent["template"]> = {
  approve: "membership_application_approved_pending_activation",
  decline: "membership_application_declined",
  request_documentation: "membership_application_documentation_required",
};

const ALLOWED_REASONS: Record<MembershipDecision, readonly MembershipDecisionReasonCode[]> = {
  approve: ["eligibility_confirmed"],
  decline: ["application_incomplete", "eligibility_not_confirmed"],
  request_documentation: ["identity_documentation_required", "application_incomplete"],
};

export function decideMembershipApplication(
  rawApplication: unknown,
  rawCommand: unknown,
): KernelResult<Readonly<{
  application: MembershipApplication;
  notification: NotificationIntent;
  audit: MembershipAuditEvent;
}>> {
  const application = parseApplication(rawApplication);
  if (!application) return invalid("Application snapshot is malformed.");
  if (!isRecord(rawCommand) || !hasExactKeys(rawCommand, [
    "applicationId",
    "actorPrincipalId",
    "actorRole",
    "decision",
    "reasonCode",
    "decidedAt",
    "idempotencyKey",
  ])) return invalid("Decision command is malformed.");
  if (
    !isUuid(rawCommand.applicationId) ||
    !isUuid(rawCommand.actorPrincipalId) ||
    !isUuid(rawCommand.idempotencyKey) ||
    !AUTH_ADMIN_ROLES.includes(rawCommand.actorRole as AuthAdminRole) ||
    !MEMBERSHIP_DECISIONS.includes(rawCommand.decision as MembershipDecision) ||
    !MEMBERSHIP_DECISION_REASON_CODES.includes(rawCommand.reasonCode as MembershipDecisionReasonCode) ||
    !isCanonicalUtc(rawCommand.decidedAt)
  ) return invalid("Decision command is malformed.");
  if (rawCommand.actorRole !== "membership_reviewer") {
    return { ok: false, code: "forbidden", message: "Membership reviewer role is required." };
  }
  if (rawCommand.applicationId !== application.applicationId || application.state !== "submitted") {
    return { ok: false, code: "state_conflict", message: "Application is not eligible for this decision." };
  }
  if (rawCommand.decidedAt < application.updatedAt) return invalid("Decision timestamp precedes application state.");

  const decision = rawCommand.decision as MembershipDecision;
  const reasonCode = rawCommand.reasonCode as MembershipDecisionReasonCode;
  if (!ALLOWED_REASONS[decision].includes(reasonCode)) {
    return { ok: false, code: "decision_reason_mismatch", message: "Decision reason is not valid for this outcome." };
  }
  const updated: MembershipApplication = {
    ...application,
    state: DECISION_STATE[decision],
    updatedAt: rawCommand.decidedAt,
    accessGranted: false,
    checkoutEligible: false,
  };
  return {
    ok: true,
    value: {
      application: updated,
      notification: intent(updated, DECISION_TEMPLATE[decision], rawCommand.idempotencyKey),
      audit: {
        eventId: rawCommand.idempotencyKey,
        applicationId: updated.applicationId,
        actorPrincipalId: rawCommand.actorPrincipalId,
        actorRole: "membership_reviewer",
        eventType: "application_decided",
        occurredAt: rawCommand.decidedAt,
        reasonCode,
      },
    },
  };
}
