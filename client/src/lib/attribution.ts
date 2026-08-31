import { isCarePath, isHealthGatewayPath } from "@shared/care/paths";
import {
  MARKETING_ATTRIBUTION_UTM_FIELDS,
  sanitizeMarketingAttributionPath,
  sanitizeMarketingAttributionValue,
} from "@shared/marketing-attribution";
import { isRecoveryHash } from "@shared/research/recovery";
import { isResearchAdminPath, isResearchPath } from "@shared/research/paths";

// Captures deliberately narrow marketing attribution for waitlist and
// early-interest submissions. Sensitive surfaces are an isolation boundary:
// their path, query, recovery hash, and referrer must never reach storage,
// submissions, or internal email through this helper.

const LANDING_KEY = "xen_landing_page";
const UTM_KEY = "xen_utm";
const REFERRER_KEY = "xen_referrer";
const ATTRIBUTION_SCHEMA_KEY = "xen_attribution_schema";
const ATTRIBUTION_SCHEMA_VERSION = "2";


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
  let normalized = pathname;
  try {
    normalized = decodeURI(pathname).toLowerCase();
  } catch {
    // A malformed path is never eligible for attribution below.
  }
  return (
    isResearchPath(pathname) ||
    isResearchAdminPath(pathname) ||
    normalized === "/admin" ||
    normalized.startsWith("/admin/") ||
    isCarePath(pathname) ||
    isHealthGatewayPath(pathname) ||
    isRecoveryHash(hash)
  );
}

function clearStoredAttribution(): void {
  sessionStorage.removeItem(LANDING_KEY);
  sessionStorage.removeItem(UTM_KEY);
  sessionStorage.removeItem(REFERRER_KEY);
  sessionStorage.removeItem(ATTRIBUTION_SCHEMA_KEY);
}

function ensureCurrentStorageSchema(): void {
  if (sessionStorage.getItem(ATTRIBUTION_SCHEMA_KEY) === ATTRIBUTION_SCHEMA_VERSION) {
    return;
  }
  // Values written before this vocabulary existed were arbitrary free text.
  // They cannot be reclassified safely, so migration is deletion.
  clearStoredAttribution();
  sessionStorage.setItem(ATTRIBUTION_SCHEMA_KEY, ATTRIBUTION_SCHEMA_VERSION);
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
    const normalized = decodeURI(parsed.pathname).toLowerCase();
    const staticPath = sanitizeMarketingAttributionPath(normalized);
    if (staticPath) return staticPath;
    // Dynamic public pages are reported only as a route category. Their raw
    // segment is intentionally discarded because a URL segment is free text.
    if (/^\/for\/[^/]+$/u.test(normalized)) return "/for/:slug";
    if (/^\/careers\/[^/]+$/u.test(normalized)) return "/careers/:slug";
    return "";
  } catch {
    return "";
  }
}

function safeReferrerOrigin(_value: string): string {
  // There is no approved referrer-origin vocabulary in the repository. An
  // arbitrary hostname can itself identify a person or customer, so the safe
  // default is no referrer capture until a reviewed finite list is published.
  return "";
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
    ensureCurrentStorageSchema();
    if (!sessionStorage.getItem(LANDING_KEY)) {
      const landing = safePublicPath(
        window.location.pathname,
        window.location.origin,
      );
      if (!landing) {
        clearStoredAttribution();
        return;
      }
      sessionStorage.setItem(LANDING_KEY, landing);
      const params = new URLSearchParams(window.location.search);
      const utm: Record<string, string> = {};
      for (const f of MARKETING_ATTRIBUTION_UTM_FIELDS) {
        const value = sanitizeMarketingAttributionValue(f, params.get(f));
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
  if (!sourcePage) {
    try {
      clearStoredAttribution();
    } catch {
      // Storage may be unavailable; the returned payload still fails closed.
    }
    return emptyAttribution();
  }
  try {
    ensureCurrentStorageSchema();
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
    utm_source: sanitizeMarketingAttributionValue("utm_source", utm.utm_source ?? null),
    utm_medium: sanitizeMarketingAttributionValue("utm_medium", utm.utm_medium ?? null),
    utm_campaign: sanitizeMarketingAttributionValue("utm_campaign", utm.utm_campaign ?? null),
    utm_content: sanitizeMarketingAttributionValue("utm_content", utm.utm_content ?? null),
    utm_term: sanitizeMarketingAttributionValue("utm_term", utm.utm_term ?? null),
  };
}
