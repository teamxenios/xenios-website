/**
 * Marketing attribution is a controlled, non-sensitive vocabulary shared by
 * the browser and the public submission boundary. Free text is never accepted:
 * syntactic validation alone cannot distinguish a campaign token from a name,
 * phone number, or other identifier.
 */

export const MARKETING_ATTRIBUTION_UTM_FIELDS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type MarketingAttributionUtmField =
  (typeof MARKETING_ATTRIBUTION_UTM_FIELDS)[number];

const SAFE_MARKETING_VOCABULARY: Readonly<
  Record<MarketingAttributionUtmField, ReadonlySet<string>>
> = {
  utm_source: new Set([
    "bing",
    "facebook",
    "google",
    "instagram",
    "linkedin",
    "newsletter",
    "partner",
    "referral",
    "youtube",
  ]),
  utm_medium: new Set([
    "affiliate",
    "cpc",
    "email",
    "newsletter",
    "organic",
    "paid-social",
    "qr",
    "referral",
    "social",
  ]),
  // No approved campaign/content/term code source exists in the repository.
  // These fields stay closed until reviewed finite values are published here.
  utm_campaign: new Set(),
  utm_content: new Set(),
  utm_term: new Set(),
};

const SAFE_PUBLIC_ATTRIBUTION_PATHS = new Set([
  "/",
  "/about",
  "/agents",
  "/argos",
  "/book",
  "/careers",
  "/careers/:slug",
  "/compliance",
  "/concepts",
  "/contact",
  "/developers",
  "/disclosures",
  "/early-interest",
  "/ecosystem",
  "/enterprise",
  "/faq",
  "/for-clients",
  "/for-coaches",
  "/for-practitioners",
  "/for/:slug",
  "/how-it-works",
  "/investors",
  "/kairos",
  "/manifesto",
  "/mvps",
  "/network",
  "/ontology",
  "/partners",
  "/press",
  "/privacy",
  "/product",
  "/security",
  "/storefront",
  "/telemedicine",
  "/terms",
  "/waitlist",
]);

export function sanitizeMarketingAttributionValue(
  field: MarketingAttributionUtmField,
  value: unknown,
): string | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SAFE_MARKETING_VOCABULARY[field].has(normalized) ? normalized : null;
}

export function sanitizeMarketingAttributionPath(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SAFE_PUBLIC_ATTRIBUTION_PATHS.has(normalized) ? normalized : null;
}
