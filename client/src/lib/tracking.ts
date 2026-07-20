import { getConfig } from "./config";
import { isRecoveryHash } from "@shared/research/recovery";
import { isResearchPath } from "@shared/research/paths";

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

let initialized = false;
const researchBoundaryKey = Symbol.for("xenios_research_document_boundary");

type DocumentNavigator = {
  assign: (url: string) => void;
  replace: (url: string) => void;
};

// SECURITY (PR #25 correction pass, founder-confirmed): third-party tracking
// must NEVER load on the private Research surface — the gateway, application,
// status, identity, password-recovery, privacy, member, and commerce pages —
// and never while a Supabase recovery hash (#access_token...&type=recovery)
// is present anywhere, because a tracking script that loads before the hash
// is consumed can receive the full recovery URL. The durable rule: no
// third-party tracking scripts anywhere under /research, and none while a
// recovery hash is in the location. Full URLs, hashes, query parameters,
// member identifiers, email addresses, and tokens are never sent to
// analytics. The recovery-hash detection reuses the canonical helper the
// recovery flow itself uses (shared/research/recovery.ts); the hash is only
// READ here, never stripped or mutated, so Supabase still consumes it.
export function trackingBlockedHere(pathname: string, hash: string): boolean {
  // isResearchPath normalizes exactly like the wouter router (decodeURI +
  // lowercase), so case-variant AND percent-encoded research URLs are all
  // blocked; the recovery-hash arm blocks a recovery landing on any path.
  return isResearchPath(pathname) || isRecoveryHash(hash);
}

export function requiresFullDocumentNavigation(currentHref: string, targetHref: string): boolean {
  try {
    const current = new URL(currentHref);
    const target = new URL(targetHref, current);
    if (current.origin !== target.origin) return false;
    const currentSensitive = trackingBlockedHere(current.pathname, current.hash);
    const targetSensitive = trackingBlockedHere(target.pathname, target.hash);
    return currentSensitive !== targetSensitive;
  } catch {
    return false;
  }
}

// The marketing site and private Research surface share one React bundle.
// Once Meta's code has executed, deleting its script tag or suppressing fbq
// does not unload its observers. The only durable isolation boundary is a new
// document. Intercept History API transitions that cross into or out of
// Research (or a recovery hash) and use a full navigation before pushState can
// expose the sensitive URL to an already-running third-party runtime.
export function installResearchDocumentBoundary(
  targetWindow: Window = window,
  documentNavigator: DocumentNavigator = {
    assign: (url) => targetWindow.location.assign(url),
    replace: (url) => targetWindow.location.replace(url),
  },
): void {
  const markedWindow = targetWindow as Window & { [researchBoundaryKey]?: boolean };
  if (markedWindow[researchBoundaryKey]) return;

  for (const method of ["pushState", "replaceState"] as const) {
    const original = targetWindow.history[method].bind(targetWindow.history);
    targetWindow.history[method] = ((state: unknown, unused: string, url?: string | URL | null) => {
      if (url != null) {
        try {
          const target = new URL(String(url), targetWindow.location.href);
          if (requiresFullDocumentNavigation(targetWindow.location.href, target.href)) {
            if (method === "replaceState") documentNavigator.replace(target.href);
            else documentNavigator.assign(target.href);
            return;
          }
        } catch {
          // Let the native History API preserve its normal validation/error.
        }
      }
      return original(state, unused, url);
    }) as History[typeof method];
  }

  Object.defineProperty(markedWindow, researchBoundaryKey, { value: true });
}

export async function initTracking(): Promise<void> {
  if (typeof window === "undefined" || initialized) return;
  if (trackingBlockedHere(window.location.pathname, window.location.hash)) return;
  const cfg = await getConfig();
  if (!cfg.metaPixelId) return;
  // Re-check after the config fetch: an in-app SPA navigation into /research
  // (or a recovery hash arriving) during the await must still block injection.
  if (trackingBlockedHere(window.location.pathname, window.location.hash)) return;
  initialized = true;

  /* Meta Pixel base code */
  (function (f: any, b: Document, e: string, v: string) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode?.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  window.fbq("init", cfg.metaPixelId);
  window.fbq("track", "PageView");
}

export function track(event: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !window.fbq) return;
  // Even when the pixel was initialized on a marketing page, no event may be
  // emitted from the Research surface (SPA navigation keeps fbq loaded).
  if (trackingBlockedHere(window.location.pathname, window.location.hash)) return;
  window.fbq("track", event, params || {});
}

export const trackPageView = () => track("PageView");
export const trackViewContent = (p?: Record<string, unknown>) => track("ViewContent", p);
export const trackLead = (p?: Record<string, unknown>) => track("Lead", p);
export const trackCompleteRegistration = (p?: Record<string, unknown>) =>
  track("CompleteRegistration", p);
export const trackSchedule = (p?: Record<string, unknown>) => track("Schedule", p);
