import { normalizeResearchPath } from "@shared/research/paths";
import { safeResearchReturnTo } from "@shared/research/auth-return-to";

// Which signed-out pages are member pages, and where sign-in should return.
//
// The shared reviewer password never opens a member page: section.tsx mounts
// every one of them behind RequireMember, which requires the member's own
// sign-in. So when the review gate is locked, these paths get a member sign-in
// handoff instead of the password form. The page content still does not
// render; only the explanation and the way forward change.
//
// Recognition reuses the closed sign-in returnTo policy (the same allowlist the
// sign-in form and recovery emails use, pinned to the member manifest by
// member-routing.test.ts). The alias tables below mirror section.tsx's legacy
// redirects into the member area; member-entry.test.ts fails if they drift.

/** Exact legacy paths section.tsx redirects into the member area. */
export const MEMBER_LEGACY_ALIASES = {
  "/research/products": "/research/member/products",
  "/research/products/peptides": "/research/member/products",
  "/research/products/supplements": "/research/member/products",
  "/research/products/quantum": "/research/member/products",
  "/research/guides": "/research/member/guides",
  "/research/orders": "/research/member/orders",
  "/research/subscriptions": "/research/member/subscriptions",
  "/research/referrals": "/research/member/referrals",
  "/research/profile": "/research/member/profile",
  "/research/systems": "/research/member/goals",
  "/research/peptides": "/research/member/products",
  "/research/supplements": "/research/member/products",
  "/research/quantum": "/research/member/products",
  "/research/shop": "/research/member/products",
  "/research/build-a-system": "/research/member/goals",
  "/research/learn": "/research/member/guides",
  "/research/cart": "/research/member/cart",
  "/research/membership": "/research/member/membership",
  "/research/framework": "/research/member/blueprint",
  "/research/programs": "/research/member/goals",
} as const satisfies Record<string, string>;

/** Legacy `/<prefix>:slug` paths section.tsx redirects to `/<target>:slug`. */
export const MEMBER_LEGACY_SLUG_ALIASES = {
  "/research/products/": "/research/member/products/",
  "/research/product/": "/research/member/products/",
} as const satisfies Record<string, string>;

/** The old emailed welcome link guards itself and sends signed-out visitors to sign-in. */
const LEGACY_MEMBER_WELCOME = "/research/member/welcome";

export interface MemberEntry {
  /** A sign-in destination the closed returnTo policy accepts, or null for plain sign-in. */
  returnTo: string | null;
}

function withoutTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/$/u, "") : path;
}

function decodedPath(pathname: string): string {
  const raw = pathname.split(/[?#]/u, 1)[0] || "/";
  try {
    return withoutTrailingSlash(decodeURI(raw));
  } catch {
    return withoutTrailingSlash(raw);
  }
}

/**
 * The member sign-in handoff for a signed-out visitor at `pathname`, or null
 * when the path is not a member page (it then keeps its existing gate).
 */
export function memberEntryFor(pathname: string, search = ""): MemberEntry | null {
  const normalized = normalizeResearchPath(pathname);

  if (normalized === LEGACY_MEMBER_WELCOME) return { returnTo: null };

  if (
    (normalized === "/research/member" || normalized.startsWith("/research/member/"))
    && safeResearchReturnTo(normalized) === normalized
  ) {
    // The visitor's own path and query, judged exactly as RequireMember judges
    // window.location: a case or encoding variant gets plain sign-in.
    const raw = withoutTrailingSlash(pathname.split(/[?#]/u, 1)[0] || "/");
    return { returnTo: safeResearchReturnTo(`${raw}${search}`) };
  }

  const alias = (MEMBER_LEGACY_ALIASES as Record<string, string>)[normalized];
  if (alias) return { returnTo: alias };

  for (const [prefix, target] of Object.entries(MEMBER_LEGACY_SLUG_ALIASES)) {
    if (!normalized.startsWith(prefix)) continue;
    // Same segment the router's :slug would capture: one non-empty segment.
    const slug = decodedPath(pathname).slice(prefix.length);
    if (!slug || slug.includes("/")) return null;
    return { returnTo: safeResearchReturnTo(`${target}${slug}`) };
  }

  return null;
}
