/**
 * Search-indexing policy for the Research route family.
 *
 * The current protected composition keeps the entire tree noindex. This
 * module is the fail-closed policy the Lead can mount when the public
 * editorial/catalog routes are ready to graduate without exposing account,
 * Early Access, application, partner-portal, or token-bearing routes.
 */

import { normalizeResearchPath } from "@shared/research/paths";

export const PUBLIC_RESEARCH_EXACT_PATHS = [
  "/research",
  "/research/access-hub",
  "/research/how-it-works",
  "/research/organizations",
  "/research/partners",
  "/research/affiliates",
  "/research/about",
  "/research/faq",
  "/research/support",
  "/research/policies",
  "/research/contact",
  "/research/privacy",
  "/research/terms",
  "/research/supplier-access",
] as const;

const PUBLIC_EXACT = new Set<string>(PUBLIC_RESEARCH_EXACT_PATHS);
const PUBLIC_POLICY_PATHS = new Set<string>([
  "/research/policies/research-use",
  "/research/policies/shipping",
  "/research/policies/returns",
] as const);

export function isPublicResearchIndexRoute(pathname: string): boolean {
  // Callers must pass a pathname, not a token/referral-bearing URL. Treating a
  // query or fragment as decoration previously made private resource variants
  // indexable by accident.
  if (pathname.includes("?") || pathname.includes("#")) return false;
  const normalized = normalizeResearchPath(pathname);
  if (!normalized) return false;
  return PUBLIC_EXACT.has(normalized) || PUBLIC_POLICY_PATHS.has(normalized);
}

export function researchRouteRobots(pathname: string): "index" | "noindex" {
  return isPublicResearchIndexRoute(pathname) ? "index" : "noindex";
}
