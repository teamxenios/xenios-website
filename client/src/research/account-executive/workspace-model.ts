import {
  aeWorkspaceEnvelopeSchema, aeWorkspaceCommandSchema, aeIdentifier, aeRequestSummarySchema,
  aeOriginalReferralInputSchema, aeReferralSummarySchema, aeAssignmentHistorySchema,
  type AeWorkspace, type AeWorkspaceCommand, type AeCustomer,
} from "@shared/research/account-executive/workspace";

/** No data loading, Auth, route, browser storage or scope authority lives here. */
export function readAeWorkspace(value: unknown, expected: { actorAuthUserId: string; scopeId: string }): AeWorkspace | null {
  if (!expected || typeof expected !== "object") return null;
  if (!aeIdentifier.safeParse(expected.actorAuthUserId).success || !aeIdentifier.safeParse(expected.scopeId).success) return null;
  const parsed = aeWorkspaceEnvelopeSchema.safeParse(value);
  return parsed.success && parsed.data.ok && parsed.data.value.actorAuthUserId === expected.actorAuthUserId &&
    parsed.data.value.scopeId === expected.scopeId ? parsed.data.value : null;
}

export function aeRequestStatusLabel(value: unknown): string {
  const parsed = aeRequestSummarySchema.safeParse(value);
  if (!parsed.success) return "Request status unavailable";
  if (!parsed.data.workflow) return "Request received; processing status unavailable";
  return parsed.data.workflow.state === "reviewing" ? "Under review" : "Queued for review";
}

export function aeContactLabel(customer: AeCustomer): string {
  return customer.contact.state === "available" ? customer.contact.displayName
    : customer.contact.state === "not_permitted" ? "Contact access not granted" : "Contact details unavailable";
}

export function aeOriginalReferralLabel(value: unknown): string {
  const parsed = aeOriginalReferralInputSchema.safeParse(value);
  return !parsed.success || parsed.data.state === "unavailable" ? "Original referral input unavailable"
    : parsed.data.state === "none" ? "No original referral input provided" : "Original referral input recorded (redacted)";
}

export function aeReferrerLabel(value: unknown): string {
  const parsed = aeReferralSummarySchema.safeParse(value);
  return !parsed.success || parsed.data.state === "unavailable" ? "Referrer attribution unavailable"
    : parsed.data.state === "none" ? "No referrer recorded"
    : parsed.data.state === "unresolved" ? "Referrer unresolved" : "Canonical referrer recorded";
}

export function aeAssignmentHistoryLabel(value: unknown): string {
  const parsed = aeAssignmentHistorySchema.safeParse(value);
  return !parsed.success || parsed.data.state === "unavailable" ? "Assignment history unavailable"
    : parsed.data.events.length === 0 ? "No assignment events recorded"
    : `${parsed.data.events.length} recorded assignment event${parsed.data.events.length === 1 ? "" : "s"}`;
}

/** Keep this exact immutable command for an uncertain retry; never mint another id. */
export function freezeAeCommand(value: unknown): Readonly<AeWorkspaceCommand> | null {
  const parsed = aeWorkspaceCommandSchema.safeParse(value);
  return parsed.success ? Object.freeze(parsed.data) : null;
}
