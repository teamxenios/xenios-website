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
