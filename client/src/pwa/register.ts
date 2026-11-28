// PWA registration — production only, fail-closed, update-aware.
//
// Registration happens ONLY in a production build (import.meta.env.PROD): dev
// servers never install a worker, so local work cannot be poisoned by a stale
// cache. The worker itself (client/public/sw.js) enforces the privacy rule
// (no /api, no non-GET, no cross-origin, no JSON in Cache Storage); this module
// only wires lifecycle UX:
//
//   * "xenios:pwa-update-available" fires on window when a new worker is
//     waiting; UI may show a "refresh for the latest version" affordance and
//     call applyPwaUpdate() when the member accepts.
//   * A replacement controller reloads once; the first claim keeps the page intact.

export function registerXeniosPwa(): void {
  if (!import.meta.env.PROD) return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        const notifyIfWaiting = () => {
          if (registration.waiting && navigator.serviceWorker.controller) {
            window.dispatchEvent(
              new CustomEvent("xenios:pwa-update-available", {
                detail: { registration },
              }),
            );
          }
        };
        notifyIfWaiting();
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", notifyIfWaiting);
        });
      })
      .catch(() => {
        // Registration failure is silent by design: the site is fully
        // functional without a worker, and there is nothing a member can do.
      });

    let reloaded = false;
    let previousController = navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      const nextController = navigator.serviceWorker.controller;
      if (!nextController || nextController === previousController) return;
      const replacesController = previousController !== null;
      previousController = nextController;
      if (!replacesController || reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

/** Promote a waiting worker immediately (called from the update UX). */
export function applyPwaUpdate(registration: ServiceWorkerRegistration): void {
  registration.waiting?.postMessage({ type: "SKIP_WAITING" });
}
