// xenios research: external capability registry contract.
//
// Every external dependency (payments, carriers, fulfillment, payouts, identity,
// messaging) is represented as a capability with an explicit state. Code is written
// against the capability, never against the assumption that a credential exists.
//
// The rule this file exists to enforce: an absent credential DISABLES a capability.
// It never crashes the site, and it never silently degrades into a fake success.

export type CapabilityState =
  | "enabled"
  | "disabled"
  | "misconfigured"
  | "pending_approval"
  | "pending_credentials"
  | "pending_supplier_data";

export type ResearchCapability =
  | "transactional_email"
  | "membership_billing"
  | "product_commerce"
  | "identity_verification"
  | "telegram_support"
  | "private_media"
  | "live_shipping_rates"
  | "mitch_fulfillment"
  | "affiliate_payouts"
  | "quantum_commerce";

export const RESEARCH_CAPABILITIES: readonly ResearchCapability[] = [
  "transactional_email",
  "membership_billing",
  "product_commerce",
  "identity_verification",
  "telegram_support",
  "private_media",
  "live_shipping_rates",
  "mitch_fulfillment",
  "affiliate_payouts",
  "quantum_commerce",
] as const;

/**
 * Member-visible capability status.
 *
 * `publicMessage` is written for a member and must never name an environment
 * variable, provider, internal system, or approval counterparty.
 *
 * `adminMessage`, `missingEnvironmentVariables`, and `missingApprovals` are
 * Samuel-only. They carry NAMES, never VALUES. A secret value must never reach
 * this structure.
 */
export interface CapabilityStatus {
  capability: ResearchCapability;
  state: CapabilityState;
  publicMessage: string;
  adminMessage?: string;
  missingEnvironmentVariables: string[];
  missingApprovals: string[];
  checkedAt: string;
}

/** The member-safe projection. Strips every administrative detail. */
export type MemberVisibleCapability = Pick<
  CapabilityStatus,
  "capability" | "state" | "publicMessage" | "checkedAt"
>;

export function toMemberVisible(status: CapabilityStatus): MemberVisibleCapability {
  return {
    capability: status.capability,
    state: status.state,
    publicMessage: status.publicMessage,
    checkedAt: status.checkedAt,
  };
}

/** True only when the capability is fully enabled. Every other state is a hard no. */
export function isCapabilityEnabled(status: CapabilityStatus | undefined): boolean {
  return status?.state === "enabled";
}

// ---------------------------------------------------------------------------
// Provider results
// ---------------------------------------------------------------------------

/**
 * Every provider call returns this. There is no throwing path for an expected
 * provider condition, so a disabled provider cannot be mistaken for an outage
 * and cannot be swallowed by a generic catch.
 */
export type ProviderResult<T> =
  | { ok: true; value: T; providerReference?: string }
  | {
      ok: false;
      code: ProviderFailureCode;
      message: string;
      retryable: boolean;
    };

export type ProviderFailureCode =
  | "DISABLED"
  | "MISCONFIGURED"
  | "REJECTED"
  | "RETRYABLE"
  | "PERMANENT_FAILURE";

export function providerOk<T>(value: T, providerReference?: string): ProviderResult<T> {
  return { ok: true, value, providerReference };
}

export function providerDisabled<T>(capability: ResearchCapability): ProviderResult<T> {
  return {
    ok: false,
    code: "DISABLED",
    message: `${capability} is not enabled.`,
    retryable: false,
  };
}

export function providerMisconfigured<T>(detail: string): ProviderResult<T> {
  return { ok: false, code: "MISCONFIGURED", message: detail, retryable: false };
}

export class CapabilityDisabledError extends Error {
  readonly code = "CAPABILITY_DISABLED";

  constructor(readonly capability: ResearchCapability) {
    super(`${capability} is not enabled`);
    this.name = "CapabilityDisabledError";
  }
}
