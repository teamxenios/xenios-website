// Local preview launcher for the research gateway (screenshots + QA only).
// Boots the PRODUCTION build with throwaway placeholder credentials so the
// password gate, the gateway and the Early Access surface render locally.
// Never used in deployment; every value here is a fixture, not a secret.
//
// WHY THE SUPABASE PLACEHOLDERS ARE HERE. This script previously set only the
// research password and session secret, and the header claimed it booted
// locally. It did not: the composition root builds the Supabase admin client
// eagerly, so `node scripts/preview-research.mjs` died at module load with
// "Supabase admin not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// missing)" before the server ever listened. Nobody could open the launch
// journey locally, which is why a visual check of the customer flow kept being
// deferred. The placeholders below only have to be present and well-formed for
// the client to construct.
//
// READ THIS BEFORE TRUSTING WHAT YOU SEE. The Supabase host below is not real,
// so every data-backed surface is running against an unreachable upstream:
//
//   * The catalogue does NOT show the canonical product set. It falls back to
//     a small declared set, and it does so with NO error banner, so the page
//     LOOKS healthy while showing a fraction of the catalog. Do not use this
//     harness to judge catalog completeness, pricing, or product pathways.
//   * Outbox and email are unconfigured, so nothing is sent. That is
//     deliberate: a preview must never email a real customer.
//
// It IS good for: page boots, layout and responsive widths, gate behaviour,
// stepper navigation, form fields and validation, and client-side console or
// network errors. For anything data-dependent, point SUPABASE_URL and the keys
// at a real read-only environment instead.
process.env.NODE_ENV = "production";
process.env.PORT = process.env.PORT || "5199";
process.env.RESEARCH_ACCESS_PASSWORD = "preview";
process.env.RESEARCH_SESSION_SECRET = "preview-secret-not-production";

// Early Access is the launch surface, so the preview opens it rather than
// leaving it switched off. OPEN_ACCESS skips the code prompt entirely, which
// keeps the real access code out of this file and out of shell history.
process.env.RESEARCH_EARLY_ACCESS_ENABLED =
  process.env.RESEARCH_EARLY_ACCESS_ENABLED || "true";
process.env.RESEARCH_EARLY_ACCESS_OPEN_ACCESS =
  process.env.RESEARCH_EARLY_ACCESS_OPEN_ACCESS || "true";
process.env.RESEARCH_EARLY_ACCESS_SESSION_SECRET =
  process.env.RESEARCH_EARLY_ACCESS_SESSION_SECRET ||
  "preview-early-access-secret-not-production";

// Present-and-well-formed only. Anything already exported wins, so pointing
// this at a real read-only project is just an env override, not an edit.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_preview_placeholder";
process.env.SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "sb_publishable_preview_placeholder";

const usingPlaceholderData = process.env.SUPABASE_URL === "http://127.0.0.1:54321";
if (usingPlaceholderData) {
  console.warn(
    "[preview] Supabase is a PLACEHOLDER. The catalogue shown is NOT the canonical\n" +
      "[preview] product set and carries no error banner. Use this preview for layout,\n" +
      "[preview] gating and form behaviour only - never to judge catalog or pricing.",
  );
}

await import("../dist/index.cjs");
