// Captures marketing attribution for waitlist + early-interest submissions.
// landing_page = the first page of the visit; utm_* + referrer are frozen on first load.

const LANDING_KEY = "xen_landing_page";
const UTM_KEY = "xen_utm";
const REFERRER_KEY = "xen_referrer";

const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

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

export function initAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    if (!sessionStorage.getItem(LANDING_KEY)) {
      sessionStorage.setItem(LANDING_KEY, window.location.pathname + window.location.search);
      const params = new URLSearchParams(window.location.search);
      const utm: Record<string, string> = {};
      for (const f of UTM_FIELDS) {
        const v = params.get(f);
        if (v) utm[f] = v.slice(0, 200);
      }
      sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
      sessionStorage.setItem(REFERRER_KEY, document.referrer || "");
    }
  } catch {
    /* sessionStorage unavailable — attribution will fall back to current page */
  }
}

export function getAttribution(): Attribution {
  let landing = "";
  let referrer = "";
  let utm: Record<string, string> = {};
  const sourcePage = typeof window !== "undefined" ? window.location.pathname : "";
  try {
    landing = sessionStorage.getItem(LANDING_KEY) || sourcePage;
    referrer = sessionStorage.getItem(REFERRER_KEY) || (typeof document !== "undefined" ? document.referrer : "");
    utm = JSON.parse(sessionStorage.getItem(UTM_KEY) || "{}");
  } catch {
    landing = sourcePage;
  }
  return {
    source_page: sourcePage,
    landing_page: landing,
    referrer_url: referrer || "",
    utm_source: utm.utm_source ?? null,
    utm_medium: utm.utm_medium ?? null,
    utm_campaign: utm.utm_campaign ?? null,
    utm_content: utm.utm_content ?? null,
    utm_term: utm.utm_term ?? null,
  };
}
