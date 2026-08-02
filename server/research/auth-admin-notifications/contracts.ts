export const MEMBERSHIP_APPLICATION_STATES = [
  "submitted",
  "pending_documentation",
  "approved_pending_activation",
  "declined",
] as const;

export type MembershipApplicationState = (typeof MEMBERSHIP_APPLICATION_STATES)[number];

export const AUTH_ADMIN_ROLES = [
  "membership_reviewer",
  "support_viewer",
  "product_control_observer",
] as const;

export type AuthAdminRole = (typeof AUTH_ADMIN_ROLES)[number];

export const MEMBERSHIP_DECISIONS = ["approve", "decline", "request_documentation"] as const;
export type MembershipDecision = (typeof MEMBERSHIP_DECISIONS)[number];

export const MEMBERSHIP_DECISION_REASON_CODES = [
  "eligibility_confirmed",
  "identity_documentation_required",
  "application_incomplete",
  "eligibility_not_confirmed",
] as const;

export type MembershipDecisionReasonCode = (typeof MEMBERSHIP_DECISION_REASON_CODES)[number];

export type TurnstileAssessment = Readonly<{
  verified: boolean;
  action: "membership_application";
  hostnameVerified: boolean;
  assessedAt: string;
  expiresAt: string;
  errorCodes: readonly string[];
}>;

export type MembershipApplication = Readonly<{
  applicationId: string;
  accountId: string;
  recipientEmail: string;
  state: MembershipApplicationState;
  createdAt: string;
  updatedAt: string;
  accessGranted: false;
  checkoutEligible: false;
}>;

export type NotificationIntent = Readonly<{
  intentId: string;
  template:
    | "membership_application_received"
    | "membership_application_documentation_required"
    | "membership_application_approved_pending_activation"
    | "membership_application_declined";
  recipientEmail: string;
  idempotencyKey: string;
  variables: Readonly<{
    applicationReference: string;
    nextState: MembershipApplicationState;
  }>;
}>;

export type MembershipAuditEvent = Readonly<{
  eventId: string;
  applicationId: string;
  actorPrincipalId: string;
  actorRole: AuthAdminRole | "public_applicant";
  eventType: "application_submitted" | "application_decided";
  occurredAt: string;
  reasonCode?: MembershipDecisionReasonCode;
}>;

export type KernelFailureCode =
  | "invalid_input"
  | "turnstile_required"
  | "turnstile_expired"
  | "forbidden"
  | "state_conflict"
  | "decision_reason_mismatch";

export type KernelResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: KernelFailureCode; message: string }>;
