/**
 * Whether the Launch A surface is served at all.
 *
 * One flag, fail closed on an exact "true". Unset, misspelled, "TRUE", "1" or
 * "yes" all mean off, because the thing behind this flag is a confidential
 * partner price sheet and a typo must never be the reason it is reachable.
 *
 * This flag answers "does this deployment serve Launch A". It does NOT answer
 * "may this viewer see it": that is entitlement.ts, and the two are separate on
 * purpose. Turning the surface on grants reachability and nothing else. With
 * the flag on and no entitlement configured, every viewer is still refused.
 */

export type KrisLaunchAEnv = Record<string, string | undefined>;

export const KRIS_LAUNCH_A_ENABLED_ENV_VAR = "RESEARCH_KRIS_LAUNCH_A_ENABLED";

export function krisLaunchAEnabled(env: KrisLaunchAEnv = process.env): boolean {
  return env[KRIS_LAUNCH_A_ENABLED_ENV_VAR] === "true";
}
