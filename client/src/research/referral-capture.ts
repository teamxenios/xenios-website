// The client half of referral capture: /research?ref=CODE is the canonical
// marketing entry, and the SPA is what receives it, so the section root fires
// ONE fire-and-forget call to the server capture door, which validates the
// code and answers 204 with (or without) the signed attribution cookie. The
// browser presents the code; the server decides everything. An invalid or
// absent code changes nothing about the visit, and a capture failure must
// never disturb the page — this module cannot throw.

const CAPTURE_PATH = "/api/referral/capture";

// A code is a short human-shareable token. Anything else is not worth a
// request — the server would refuse it anyway; this just avoids the noise.
const PLAUSIBLE_CODE = /^[A-Za-z0-9_-]{2,64}$/;

let firedForThisLoad = false;

/**
 * Fire the capture call once per document load when ?ref= is present.
 * Safe to call from any research render path; re-renders and client-side
 * navigations are no-ops.
 */
export function captureReferralFromLocation(): void {
  if (firedForThisLoad || typeof window === "undefined") return;
  firedForThisLoad = true;
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (!code || !PLAUSIBLE_CODE.test(code)) return;
    void fetch(`${CAPTURE_PATH}?ref=${encodeURIComponent(code)}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    }).catch(() => undefined);
  } catch {
    // Never let capture interfere with the visit.
  }
}

/** Test hook: reset the once-per-load latch. */
export function resetReferralCaptureForTests(): void {
  firedForThisLoad = false;
}
