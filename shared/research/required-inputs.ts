import type { PrelaunchLaunchStatus, PrelaunchRole } from "./prelaunch";

export const REQUIRED_INPUT_STATES = [
  "missing",
  "entered",
  "under_review",
  "verified",
  "rejected",
  "expired",
  "superseded",
  "not_applicable",
] as const;
export type RequiredInputState = (typeof REQUIRED_INPUT_STATES)[number];

export const REQUIRED_INPUT_BLOCKING_LEVELS = [
  "informational",
  "blocks_display",
  "blocks_transaction",
  "blocks_fulfillment",
  "blocks_public_launch",
  "blocks_clinical_activation",
  "blocks_provider_activation",
] as const;
export type RequiredInputBlockingLevel =
  (typeof REQUIRED_INPUT_BLOCKING_LEVELS)[number];

export const REQUIRED_INPUT_ENTRY_MODES = [
  "direct",
  "record_reference",
  "external_secret",
] as const;
export type RequiredInputEntryMode =
  (typeof REQUIRED_INPUT_ENTRY_MODES)[number];

export type RequiredInputAuditEvent = {
  id: string;
  fromState: RequiredInputState | null;
  toState: RequiredInputState;
  actor: string;
  reason: string;
  occurredAt: string;
};

export type RequiredInput = {
  id: string;
  key: string;
  domain: string;
  label: string;
  description: string;
  whyRequired: string;
  recordType: string;
  recordId: string | null;
  fieldPath: string;
  currentState: RequiredInputState;
  blockingLevel: RequiredInputBlockingLevel;
  responsibleRole: PrelaunchRole;
  verificationMethod: string;
  evidenceRequired: string[];
  entryMode: RequiredInputEntryMode;
  enteredValue: unknown | null;
  externalReferenceName: string | null;
  enteredBy: string | null;
  enteredAt: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  publicLaunchImpact: string;
  nextAction: string;
  adminEntryHref: string;
  version: number;
  auditHistory: RequiredInputAuditEvent[];
};

export type RequiredInputSummary = {
  total: number;
  missing: number;
  launchBlocking: number;
  transactionBlocking: number;
  clinicalBlocking: number;
  entered: number;
  underReview: number;
  verified: number;
  rejected: number;
  expired: number;
};

export type DomainReadiness = {
  domain: string;
  launchStatus: PrelaunchLaunchStatus;
  softwareComplete: boolean;
  realInputsRequired: boolean;
  publicEnabled: boolean;
  manifestApproved: boolean;
  expectedInputCount: number;
  actualInputCount: number;
  blockingInputCount: number;
  blockingKeys: string[];
  version: number;
};

export function isRequiredInputState(
  value: unknown,
): value is RequiredInputState {
  return (
    typeof value === "string" &&
    (REQUIRED_INPUT_STATES as readonly string[]).includes(value)
  );
}

export function isRequiredInputBlockingLevel(
  value: unknown,
): value is RequiredInputBlockingLevel {
  return (
    typeof value === "string" &&
    (REQUIRED_INPUT_BLOCKING_LEVELS as readonly string[]).includes(value)
  );
}

export function isRequiredInputEntryMode(
  value: unknown,
): value is RequiredInputEntryMode {
  return (
    typeof value === "string" &&
    (REQUIRED_INPUT_ENTRY_MODES as readonly string[]).includes(value)
  );
}

export function valueMayBeStored(
  mode: RequiredInputEntryMode,
  value: unknown,
): boolean {
  if (mode === "external_secret") return value === null || value === undefined;
  return value !== undefined;
}

export type RequiredInputDefinition = Omit<
  RequiredInput,
  | "id"
  | "currentState"
  | "enteredBy"
  | "enteredAt"
  | "verifiedBy"
  | "verifiedAt"
  | "rejectionReason"
  | "enteredValue"
  | "externalReferenceName"
  | "version"
  | "auditHistory"
> & {
  responsibleRole: PrelaunchRole;
};
