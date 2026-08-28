import { isCarePath } from "@shared/care/paths";
import { isRecoveryHash } from "@shared/research/recovery";
import { isResearchPath } from "@shared/research/paths";

// Captures deliberately narrow marketing attribution for waitlist and
// early-interest submissions. Sensitive surfaces are an isolation boundary:
// their path, query, recovery hash, and referrer must never reach storage,
// submissions, or internal email through this helper.

const LANDING_KEY = "xen_landing_page";
const UTM_KEY = "xen_utm";
const REFERRER_KEY = "xen_referrer";

const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

const SAFE_MARKETING_VALUE = /^[A-Za-z0-9][A-Za-z0-9 ._~+-]{0,99}$/u;

export interface Attribution {
  source_page: string;
  landing_page: string;
  referrer_url: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

function isSensitiveAttributionLocation(pathname: string, hash: string): boolean {
  return isResearchPath(pathname) || isCarePath(pathname) || isRecoveryHash(hash);
}

function clearStoredAttribution(): void {
  sessionStorage.removeItem(LANDING_KEY);
  sessionStorage.removeItem(UTM_KEY);
  sessionStorage.removeItem(REFERRER_KEY);
}

function safeMarketingValue(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return SAFE_MARKETING_VALUE.test(trimmed) ? trimmed : null;
}

function parseStoredUtm(value: string | null): Record<string, unknown> {
  if (!value) return {};
  const parsed: unknown = JSON.parse(value);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function safePublicPath(value: string, origin: string): string {
  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin || isSensitiveAttributionLocation(parsed.pathname, parsed.hash)) {
      return "";
    }
    // Query strings are intentionally represented only by the allowlisted UTM
    // fields below. Arbitrary parameters never become an attribution payload.
    return parsed.pathname;
  } catch {
    return "";
  }
}

function safeReferrerOrigin(value: string): string {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    if (isSensitiveAttributionLocation(parsed.pathname, parsed.hash)) return "";
    // Attribution needs, at most, the referring site. Never retain its path,
    // query, credentials, or fragment.
    return parsed.origin;
  } catch {
    return "";
  }
}

function emptyAttribution(): Attribution {
  return {
    source_page: "",
    landing_page: "",
    referrer_url: "",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
  };
}

export function initAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    if (isSensitiveAttributionLocation(window.location.pathname, window.location.hash)) {
      clearStoredAttribution();
      return;
    }
    if (!sessionStorage.getItem(LANDING_KEY)) {
      sessionStorage.setItem(LANDING_KEY, window.location.pathname);
      const params = new URLSearchParams(window.location.search);
      const utm: Record<string, string> = {};
      for (const f of UTM_FIELDS) {
        const value = safeMarketingValue(params.get(f));
        if (value) utm[f] = value;
      }
      sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
      sessionStorage.setItem(
        REFERRER_KEY,
        safeReferrerOrigin(document.referrer || ""),
      );
    }
  } catch {
    /* sessionStorage unavailable — attribution stays narrow and ephemeral. */
  }
}

export function getAttribution(): Attribution {
  if (typeof window === "undefined") return emptyAttribution();
  if (isSensitiveAttributionLocation(window.location.pathname, window.location.hash)) {
    try {
      clearStoredAttribution();
    } catch {
      // Storage may be unavailable; the returned payload still fails closed.
    }
    return emptyAttribution();
  }

  let landing = "";
  let referrer = "";
  let utm: Record<string, unknown> = {};
  const sourcePage = safePublicPath(window.location.pathname, window.location.origin);
  try {
    landing = safePublicPath(
      sessionStorage.getItem(LANDING_KEY) || sourcePage,
      window.location.origin,
    );
    referrer = safeReferrerOrigin(
      sessionStorage.getItem(REFERRER_KEY) || document.referrer || "",
    );
    utm = parseStoredUtm(sessionStorage.getItem(UTM_KEY));
  } catch {
    landing = sourcePage;
  }
  return {
    source_page: sourcePage,
    landing_page: landing,
    referrer_url: referrer || "",
    utm_source: safeMarketingValue(utm.utm_source ?? null),
    utm_medium: safeMarketingValue(utm.utm_medium ?? null),
    utm_campaign: safeMarketingValue(utm.utm_campaign ?? null),
    utm_content: safeMarketingValue(utm.utm_content ?? null),
    utm_term: safeMarketingValue(utm.utm_term ?? null),
  };
}
