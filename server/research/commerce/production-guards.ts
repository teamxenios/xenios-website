// Production synthetic-data guard.
//
// Engineering, QA, staging, screenshots, and running-server tests all run on
// clearly-labeled synthetic fixtures (the Mitch sandbox profile, test lots,
// test COAs). That is deliberate and safe BECAUSE of this module: no synthetic
// marker may ever be live while the process is production-like. Demo and
// sandbox data must never silently become production data.
//
// The guard refuses, loudly and before any provider call or database write,
// when a configuration value or fixture payload carries a synthetic marker and
// either NODE_ENV=production or a production capability flag is enabled.
//
// WIRED CHOKEPOINTS: every live provider resolver calls
// assertNoSyntheticDataInProduction on the configuration it is about to
// construct with, BEFORE the adapter exists: payment (resolvePaymentProvider),
// payout (resolvePayoutProvider), shipping (resolveShippingProvider), and
// fulfillment (createMitchFulfillmentProvider). A live adapter therefore
// cannot come into being over a synthetic profile in a production-like
// process. Each wiring is covered by that provider's own resolver tests.

/** The unmistakable markers every synthetic fixture must carry. */
export const SYNTHETIC_MARKERS: readonly string[] = [
  "synthetic_test_fixture",
  "example.invalid",
  "MITCH_TEST_",
  "TEST_COA_",
  "TEST_LOT_",
];

/** Production capability flags: any of these being "true" makes the process production-like. */
const PRODUCTION_FLAG_NAMES: readonly string[] = [
  "NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED",
  "RESEARCH_MEMBERSHIP_BILLING_ENABLED",
  "RESEARCH_MITCH_FULFILLMENT_ENABLED",
  "RESEARCH_LIVE_SHIPPING_ENABLED",
  "RESEARCH_AFFILIATE_PAYOUTS_ENABLED",
  "RESEARCH_FOUNDING_ACTIVATION_ENABLED",
];

export function isProductionLike(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production") return true;
  return PRODUCTION_FLAG_NAMES.some((name) => env[name] === "true");
}

/** Returns the first synthetic marker found in the value, else null. Case-insensitive. */
export function findSyntheticMarker(value: string): string | null {
  const lower = value.toLowerCase();
  for (const marker of SYNTHETIC_MARKERS) {
    if (lower.includes(marker.toLowerCase())) return marker;
  }
  return null;
}

export interface SyntheticViolation {
  path: string;
  marker: string;
  /** A short redacted excerpt, never the full value (a value could be adjacent to a secret). */
  excerpt: string;
}

function excerptAround(value: string, marker: string): string {
  const idx = value.toLowerCase().indexOf(marker.toLowerCase());
  const start = Math.max(0, idx - 8);
  return value.slice(start, idx + marker.length + 8);
}

/**
 * Deep-scan an object (config, fixture payload, provider profile) for
 * synthetic markers in any string value OR string key. Returns every violation
 * with its path, so an operator sees exactly which field is synthetic.
 */
export function scanForSyntheticMarkers(input: unknown, path = ""): SyntheticViolation[] {
  const violations: SyntheticViolation[] = [];
  if (typeof input === "string") {
    const marker = findSyntheticMarker(input);
    if (marker) violations.push({ path: path || "(root)", marker, excerpt: excerptAround(input, marker) });
    return violations;
  }
  if (Array.isArray(input)) {
    input.forEach((item, i) => violations.push(...scanForSyntheticMarkers(item, `${path}[${i}]`)));
    return violations;
  }
  if (input !== null && typeof input === "object") {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const keyMarker = findSyntheticMarker(key);
      if (keyMarker) violations.push({ path: path ? `${path}.${key}` : key, marker: keyMarker, excerpt: key });
      violations.push(...scanForSyntheticMarkers(value, path ? `${path}.${key}` : key));
    }
  }
  return violations;
}

export class SyntheticDataInProductionError extends Error {
  constructor(public readonly violations: SyntheticViolation[]) {
    super(
      "Synthetic fixture data is present in a production-like configuration and was refused: " +
        violations.map((v) => `${v.path} carries ${v.marker}`).join("; ") +
        ". Replace every synthetic value with its confirmed real configuration " +
        "(see docs/research-launch/MITCH_LIVE_CONFIGURATION_WORKSHEET.md) before enabling.",
    );
    this.name = "SyntheticDataInProductionError";
  }
}

/**
 * The activation chokepoint. Call at composition time (production wiring) with
 * every provider profile and configuration object that will become live. In a
 * production-like process, any synthetic marker throws BEFORE a provider call
 * or database write can happen. Outside production, synthetic data is allowed
 * (that is what demo and sandbox are for) and the scan is a no-op.
 */
export function assertNoSyntheticDataInProduction(
  candidates: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isProductionLike(env)) return;
  const violations: SyntheticViolation[] = [];
  for (const [name, candidate] of Object.entries(candidates)) {
    violations.push(...scanForSyntheticMarkers(candidate, name));
  }
  if (violations.length > 0) throw new SyntheticDataInProductionError(violations);
}
