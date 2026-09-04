/**
 * Closed navigation policy shared by sign-in and server-generated recovery
 * emails. A destination is a navigation hint, NEVER identity or entitlement.
 * Deliberately excludes admin, parked organization/invitation routes, tokens,
 * fragments and arbitrary query data. Manifest parity is tested on the client.
 */
export const AUTH_RETURN_STATIC_PATHS = [
  "/research", "/research/activate",
  ...[
    "", "/profile", "/assessment", "/blueprint", "/xenios-30", "/xenios-90",
    "/documents", "/tracker", "/goals", "/products", "/catalog", "/kris-catalog",
    "/supplements", "/metabolic-care", "/diagnostics", "/storage", "/education",
    "/support", "/product-requests", "/product-requests/new", "/guides", "/cart",
    "/checkout", "/orders", "/subscriptions", "/questions", "/referrals",
    "/security", "/privacy", "/membership", "/documents-center",
  ].map((suffix) => `/research/member${suffix}`),
  ...[
    "", "/orders", "/subscription", "/care", "/documents", "/support",
    "/profile", "/security", "/interests",
  ].map((suffix) => `/research/account${suffix}`),
  "/research/early-access", "/research/early-access/order-request",
  "/health", "/care", "/care/schedule", "/care/portal", "/care/how-it-works",
  "/care/provider-review", "/care/support",
] as const;

const STATIC_PATHS = new Set<string>(AUTH_RETURN_STATIC_PATHS);
const DYNAMIC_PATHS = [
  /^\/research\/member\/(?:goals|products|guides|orders)\/[a-z0-9][a-z0-9._-]{0,191}$/,
  /^\/research\/member\/(?:catalog|kris-catalog)\/[a-z0-9]+(?:_[a-z0-9]+)*\/[a-z0-9][a-z0-9-]{0,191}$/,
  /^\/research\/account\/orders\/[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/,
  /^\/research\/early-access\/order-request\/(?:confirmation\/)?[A-Za-z0-9][A-Za-z0-9_-]{0,191}$/,
];

function safeQueryValue(path: string, key: string, value: string): boolean {
  // A few non-secret view/selection hints. No raw search text, referral code,
  // claim/status credential, nested returnTo or arbitrary analytics payload.
  if (key === "from") return /^(?:sign-in|account|catalog|security)$/.test(value);
  if (key === "tab") return /^(?:overview|payment|tracking|documents|history)$/.test(value);
  // Match the existing storefront entry-intent contract (variant/qty/intent),
  // including catalog-generated variant IDs containing dots.
  if (key === "variant") return /^[A-Za-z0-9._-]{1,80}$/.test(value);
  if (key === "qty") return /^(?:[1-9][0-9]?|100)$/.test(value);
  if (key === "intent") return /^(?:buy_now|assisted_order|request_quote|care)$/.test(value);
  // The assessment uses this exact mode to select monthly check-in data,
  // not merely presentation. Do not allow modes on unrelated destinations.
  if (key === "mode") return path === "/research/member/assessment" && value === "checkin";
  return false;
}

export function safeResearchReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 2048 || value !== value.trim()) return null;
  if (!value.startsWith("/") || value.startsWith("//") || /[\\#\u0000-\u001f\u007f]/.test(value)) return null;
  const rawPath = value.split("?", 1)[0];
  // Check BEFORE URL normalization: no encoded path bytes, dot segments,
  // whitespace or trailing/nested separators can become another route.
  if (/[%\s]/.test(rawPath) || /\/(?:\.{1,2})(?:\/|$)/.test(rawPath)) return null;
  if (!STATIC_PATHS.has(rawPath) && !DYNAMIC_PATHS.some((pattern) => pattern.test(rawPath))) return null;
  try {
    const parsed = new URL(value, "https://xenios.invalid");
    if (parsed.origin !== "https://xenios.invalid" || parsed.pathname !== rawPath) return null;
    const safeQuery = new URLSearchParams();
    for (const [key, entry] of parsed.searchParams) {
      if (parsed.searchParams.getAll(key).length === 1 && safeQueryValue(rawPath, key, entry)) safeQuery.set(key, entry);
    }
    const query = safeQuery.toString();
    return `${rawPath}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

export function researchAuthPath(
  entry: "/research/sign-in" | "/research/reset-password",
  requestedReturnTo?: unknown,
): string {
  const destination = safeResearchReturnTo(requestedReturnTo);
  return destination ? `${entry}?returnTo=${encodeURIComponent(destination)}` : entry;
}
