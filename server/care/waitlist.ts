import type { CareEligibilityDecision } from "@shared/care/eligibility";

export type CareWaitlistGate =
  | { allowed: true; stateCode: string }
  | {
      allowed: false;
      reason: "waitlist_unavailable" | "state_mismatch";
    };

export function authorizeCareWaitlistChange(
  decision: CareEligibilityDecision,
  requestedStateCode: string,
  action: "joined" | "withdrawn",
): CareWaitlistGate {
  if (!decision.stateCode) {
    return { allowed: false, reason: "waitlist_unavailable" };
  }
  if (decision.stateCode !== requestedStateCode) {
    return { allowed: false, reason: "state_mismatch" };
  }
  if (action === "joined" && decision.outcome !== "waitlist_available") {
    return { allowed: false, reason: "waitlist_unavailable" };
  }
  return { allowed: true, stateCode: decision.stateCode };
}
