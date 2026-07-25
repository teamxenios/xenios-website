import {
  CARE_CAPABILITY_STATES,
  type CareCapabilityState,
  type CareCapabilityStatus,
} from "@shared/care/contracts";

const PUBLIC_MESSAGES: Readonly<Record<CareCapabilityState, string>> = {
  disabled: "Care is being prepared.",
  pending_contract: "Care partners are being finalized.",
  pending_coverage: "State coverage is being prepared.",
  pending_credentials: "Care access is being configured.",
  pending_content: "Clinician-approved content is being prepared.",
  pending_pharmacy: "Pharmacy access is being prepared.",
  pending_clinicians: "Clinician coverage is being prepared.",
  pending_qa: "Care is completing quality review.",
  enabled: "Care is available in supported locations.",
};

export function readCareCapabilityState(env: NodeJS.ProcessEnv = process.env): CareCapabilityState {
  const requested = env.CARE_CAPABILITY_STATE;
  if (
    requested &&
    (CARE_CAPABILITY_STATES as readonly string[]).includes(requested) &&
    requested !== "enabled"
  ) {
    return requested as CareCapabilityState;
  }
  if (requested === "enabled" && env.CARE_ENABLE_APPROVED === "true") {
    return "enabled";
  }
  return "disabled";
}

export function careCapabilityStatus(
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): CareCapabilityStatus {
  const state = readCareCapabilityState(env);
  return {
    rail: "care",
    state,
    enabled: state === "enabled",
    publicMessage: PUBLIC_MESSAGES[state],
    checkedAt: now.toISOString(),
  };
}
