// Local preview launcher for the research CUSTOMER surface (QA only).
//
// scripts/preview-research.mjs boots the gateway with a password so the access
// gate itself can be reviewed. That gate is the only thing reachable there, so
// it cannot be used to QA the surface BEHIND it: the catalog, apply flow, legal
// pages and sign-in never render.
//
// This launcher boots the same production build in RESEARCH_PUBLIC mode, which
// is the application's own supported switch for an open gateway, so the
// customer routes render locally for viewport, keyboard and accessibility
// checks. It changes nothing about authorization: member-only routes still
// require a real member session, and every server guard is untouched.
//
// Never used in deployment. The values here are throwaway fixtures, not
// secrets, and this file is not imported by the client bundle or mounted by the
// Express app.
process.env.NODE_ENV = "production";
process.env.PORT = process.env.PORT || "5198";
process.env.RESEARCH_PUBLIC = "true";
process.env.RESEARCH_SESSION_SECRET = "preview-secret-not-production";

// Placeholder Supabase env, QA fixture only, resolves to nothing routable.
// Current main crashes AT BOOT without these because the Care repository
// builders call getSupabaseAdmin() at module scope (reported on issue #44;
// CODEX-5 lane). With placeholders the server boots; Supabase-backed routes
// fail at request time, which is fine for frontend QA and exactly what this
// launcher is for.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://preview-fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "preview-fixture-not-a-key";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "preview-fixture-not-a-key";

await import("../dist/index.cjs");
