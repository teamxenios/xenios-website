import type {
  DomainReadiness,
  RequiredInput,
  RequiredInputState,
} from "@shared/research/required-inputs";

export const WEBSITE3_REQUIRED_INPUT_DOMAINS = [
  "products",
  "variants",
  "pricing",
  "product_content",
  "inventory",
  "lots",
  "coas",
  "supplements",
  "superpower",
  "metabolic_pathways",
  "diagnostics",
] as const;

export type Website3RequiredInputDomain =
  (typeof WEBSITE3_REQUIRED_INPUT_DOMAINS)[number];

const RESOLVED_STATES: readonly RequiredInputState[] = [
  "verified",
  "not_applicable",
  "superseded",
];

export type Website3ReadinessDecision = {
  publicEnabled: boolean;
  softwareComplete: boolean;
  realInputsRequired: boolean;
  blockingLabels: string[];
  publicMessage:
    | null
    | "Documentation pending"
    | "Not currently available"
    | "Partner configuration pending";
};

function unresolved(item: RequiredInput): boolean {
  return (
    item.blockingLevel !== "informational" &&
    !RESOLVED_STATES.includes(item.currentState)
  );
}

function publicMessage(
  items: readonly RequiredInput[],
): Exclude<Website3ReadinessDecision["publicMessage"], null> {
  if (
    items.some((item) =>
      [
        "blocks_transaction",
        "blocks_fulfillment",
        "blocks_public_launch",
      ].includes(item.blockingLevel),
    )
  ) {
    return "Not currently available";
  }
  if (
    items.some((item) => item.blockingLevel === "blocks_provider_activation")
  ) {
    return "Partner configuration pending";
  }
  return "Documentation pending";
}

/**
 * Domain-local application of the canonical readiness object. This function
 * cannot enable a domain: it only accepts Website 2's server-computed
 * `publicEnabled` decision and fails closed when the readiness record, manifest,
 * counts, or canonical input states are inconsistent.
 */
export function evaluateWebsite3Readiness(
  domain: Website3RequiredInputDomain,
  items: readonly RequiredInput[],
  readiness: DomainReadiness | null | undefined,
): Website3ReadinessDecision {
  const domainItems = items.filter((item) => item.domain === domain);
  const blocking = domainItems.filter(unresolved);
  const canonicalReady =
    readiness?.domain === domain &&
    readiness.publicEnabled === true &&
    readiness.softwareComplete === true &&
    readiness.manifestApproved === true &&
    readiness.realInputsRequired === false &&
    readiness.blockingInputCount === 0 &&
    readiness.expectedInputCount > 0 &&
    readiness.actualInputCount === readiness.expectedInputCount &&
    readiness.launchStatus === "public_enabled";
  const publicEnabled = canonicalReady && blocking.length === 0;

  return {
    publicEnabled,
    softwareComplete: readiness?.softwareComplete === true,
    realInputsRequired:
      readiness?.realInputsRequired !== false || blocking.length > 0,
    blockingLabels: blocking.map((item) => item.label),
    publicMessage: publicEnabled
      ? null
      : publicMessage(blocking.length ? blocking : domainItems),
  };
}

/**
 * Public projections intentionally omit canonical keys, field paths, evidence,
 * actors, and partner/contract details.
 */
export function toWebsite3PublicReadiness(
  decision: Website3ReadinessDecision,
): {
  available: boolean;
  message: Website3ReadinessDecision["publicMessage"];
} {
  return {
    available: decision.publicEnabled,
    message: decision.publicMessage,
  };
}
