import type {
  MasterOfferingCatalogAudience,
  MasterOfferingCatalogLaunchScope,
} from "@shared/research/master-offerings/contract";
import {
  hasFullCatalogVisibility,
  type VisibilityEnv,
} from "../catalog-display/visibility";

export const MASTER_OFFERINGS_ENABLED_ENV_VAR =
  "RESEARCH_MASTER_OFFERINGS_ENABLED";
export const MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR =
  "RESEARCH_MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY";

export function masterOfferingsEnabled(
  env: VisibilityEnv = process.env,
): boolean {
  return env[MASTER_OFFERINGS_ENABLED_ENV_VAR] === "true";
}
/** Fail closed to founder/admin-only until an explicit all-member decision. */
export function masterOfferingsLaunchScope(
  env: VisibilityEnv = process.env,
): MasterOfferingCatalogLaunchScope {
  return env[MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR] === "false"
    ? "all_members"
    : "founder_admin";
}

export function mayViewMasterOfferings(input: {
  audience: MasterOfferingCatalogAudience;
  email: string;
  env?: VisibilityEnv;
}): boolean {
  if (input.audience === "admin") return true;
  const env = input.env ?? process.env;
  if (masterOfferingsLaunchScope(env) === "all_members") return true;
  return hasFullCatalogVisibility(input.email, env);
}
