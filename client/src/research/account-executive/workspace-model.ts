import {
  aeWorkspaceEnvelopeSchema, aeWorkspaceCommandSchema, aeIdentifier, aeRequestSummarySchema,
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

/** Keep this exact immutable command for an uncertain retry; never mint another id. */
export function freezeAeCommand(value: unknown): Readonly<AeWorkspaceCommand> | null {
  const parsed = aeWorkspaceCommandSchema.safeParse(value);
  return parsed.success ? Object.freeze(parsed.data) : null;
}
