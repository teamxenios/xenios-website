import type { CareCoverageSnapshot } from "@shared/care/eligibility";
import {
  CARE_SERVICE_CATEGORIES,
  type CareReferralErrorCode,
  type CareServiceCategory,
} from "@shared/care/referral";
import {
  resolveCareHandoffConfig,
  type CareHandoffConfig,
} from "@shared/care/referral-handoff";
import { normalizeCareStateCode } from "./eligibility";

/**
 * State aware routing for a referral.
 *
 * This reuses the Care state coverage model that already exists rather than
 * inventing a second one: `CareCoverageSnapshot` is the same shape the
 * eligibility path reads out of `care_supported_states` and
 * `care_clinician_state_coverage`. The only thing added here is which service
 * categories a state is covered for, because a referral has to choose one.
 */
export interface CareReferralCoverage extends CareCoverageSnapshot {
  supportedServiceCategories: readonly CareServiceCategory[];
}

export const CARE_REFERRAL_ROUTING_REASONS = [
  "care_disabled",
  "invalid_state",
  "state_not_supported",
  "service_not_available_in_state",
  "clinician_coverage_unavailable",
  "service_not_recognized",
] as const;

export type CareReferralRoutingReason =
  (typeof CARE_REFERRAL_ROUTING_REASONS)[number];

export type CareReferralRoutingDecision =
  | {
      routable: true;
      stateCode: string;
      serviceCategory: CareServiceCategory;
      waitlistAvailable: false;
    }
  | {
      routable: false;
      stateCode: string | null;
      reason: CareReferralRoutingReason;
      waitlistAvailable: boolean;
      publicMessage: string;
    };

const ROUTING_MESSAGES: Readonly<Record<CareReferralRoutingReason, string>> = {
  care_disabled: "Care is being prepared.",
  invalid_state: "Select the state you are currently in.",
  state_not_supported: "Care is not available in that state yet.",
  service_not_available_in_state:
    "That service is not available in your state yet.",
  clinician_coverage_unavailable:
    "No clinician is covering that state right now.",
  service_not_recognized: "Select a service to continue.",
};

/**
 * The routing errors that are worth recording on a referral. Routing refusals
 * that never produced a referral are simply refusals, not stored errors.
 */
export const CARE_ROUTING_ERROR_CODE: Readonly<
  Partial<Record<CareReferralRoutingReason, CareReferralErrorCode>>
> = {
  state_not_supported: "state_not_supported",
  service_not_available_in_state: "service_not_available_in_state",
};

export function isCareServiceCategory(
  value: unknown,
): value is CareServiceCategory {
  return (
    typeof value === "string" &&
    (CARE_SERVICE_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Decide whether a referral can be routed. Pure, deterministic, and fail
 * closed: every unknown answer is a refusal, and a refusal never becomes a
 * scheduling promise.
 */
export function selectCareReferralRouting(input: {
  careEnabled: boolean;
  stateCode: string;
  serviceCategory: unknown;
  coverage: CareReferralCoverage | null;
}): CareReferralRoutingDecision {
  const refuse = (
    reason: CareReferralRoutingReason,
    stateCode: string | null,
    waitlistAvailable = false,
  ): CareReferralRoutingDecision => ({
    routable: false,
    stateCode,
    reason,
    waitlistAvailable,
    publicMessage: ROUTING_MESSAGES[reason],
  });

  if (!input.careEnabled) return refuse("care_disabled", null);

  const stateCode = normalizeCareStateCode(input.stateCode);
  if (!stateCode) return refuse("invalid_state", null);

  if (!isCareServiceCategory(input.serviceCategory)) {
    return refuse("service_not_recognized", stateCode);
  }

  const coverage = input.coverage;
  if (
    !coverage ||
    normalizeCareStateCode(coverage.stateCode) !== stateCode ||
    !coverage.supportedStateActive
  ) {
    return refuse(
      "state_not_supported",
      stateCode,
      coverage?.waitlistEnabled === true,
    );
  }
  if (
    !coverage.serviceCoverageActive ||
    !coverage.supportedServiceCategories.includes(input.serviceCategory)
  ) {
    return refuse(
      "service_not_available_in_state",
      stateCode,
      coverage.waitlistEnabled,
    );
  }
  if (coverage.activeClinicianCount < 1) {
    return refuse(
      "clinician_coverage_unavailable",
      stateCode,
      coverage.waitlistEnabled,
    );
  }

  return {
    routable: true,
    stateCode,
    serviceCategory: input.serviceCategory,
    waitlistAvailable: false,
  };
}

/**
 * Which service categories a state can actually be offered. Used to build the
 * selector, so a person is never shown a service that would then be refused.
 */
export function availableServiceCategories(
  coverage: CareReferralCoverage | null,
): readonly CareServiceCategory[] {
  if (
    !coverage ||
    !coverage.supportedStateActive ||
    !coverage.serviceCoverageActive ||
    coverage.activeClinicianCount < 1
  ) {
    return [];
  }
  return CARE_SERVICE_CATEGORIES.filter((category) =>
    coverage.supportedServiceCategories.includes(category),
  );
}

/**
 * The handoff the server will advertise. Reading it from an injected record
 * keeps a test from picking up a real configured URL from the ambient
 * environment.
 */
export function careHandoffFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): CareHandoffConfig {
  return resolveCareHandoffConfig(env);
}
