/**
 * Search-indexing policy for the Research route family.
 *
 * The current protected composition keeps the entire tree noindex. This
 * module is the fail-closed policy the Lead can mount when the public
 * editorial/catalog routes are ready to graduate without exposing account,
 * Early Access, application, partner-portal, or token-bearing routes.
 */

export const PUBLIC_RESEARCH_EXACT_PATHS = [
  "/research",
  "/research/access-hub",
  "/research/catalog",
  "/research/how-it-works",
  "/research/quality",
  "/research/testing",
  "/research/documents",
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
const PUBLIC_DESCENDANT_ROOTS = [
  "/research/catalog/",
  "/research/categories/",
  "/research/lots/",
  "/research/policies/",
] as const;

function normalizePathname(pathname: string): string {
  const withoutQueryOrHash = pathname.split(/[?#]/, 1)[0] || "/";
  let decoded = withoutQueryOrHash;
  try {
    decoded = decodeURI(withoutQueryOrHash);
  } catch {
    return "";
  }
  const lower = decoded.toLowerCase();
  return lower.length > 1 ? lower.replace(/\/+$/, "") : lower;
}

export function isPublicResearchIndexRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (!normalized) return false;
  if (PUBLIC_EXACT.has(normalized)) return true;
  return PUBLIC_DESCENDANT_ROOTS.some((root) => {
    if (!normalized.startsWith(root)) return false;
    const descendant = normalized.slice(root.length);
    return descendant.length > 0 && !descendant.includes("/");
  });
}

export function researchRouteRobots(pathname: string): "index" | "noindex" {
  return isPublicResearchIndexRoute(pathname) ? "index" : "noindex";
}
