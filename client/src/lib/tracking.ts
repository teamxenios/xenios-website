import { getConfig } from "./config";

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

let initialized = false;

export async function initTracking(): Promise<void> {
  if (typeof window === "undefined" || initialized) return;
  const cfg = await getConfig();
  if (!cfg.metaPixelId) return;
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
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", event, params || {});
  }
}

export const trackPageView = () => track("PageView");
export const trackViewContent = (p?: Record<string, unknown>) => track("ViewContent", p);
export const trackLead = (p?: Record<string, unknown>) => track("Lead", p);
export const trackCompleteRegistration = (p?: Record<string, unknown>) =>
  track("CompleteRegistration", p);
export const trackSchedule = (p?: Record<string, unknown>) => track("Schedule", p);
