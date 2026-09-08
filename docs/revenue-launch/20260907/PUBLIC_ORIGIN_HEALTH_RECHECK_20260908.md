# Public origin health recheck — 2026-09-08

Read-only requests to the public origin returned HTTP 200 for `/api/health`, `/`, and `/research`.

The health response reported `Xenios API is running`, `supabaseConfigured:true`, `adminConfigured:true`, `commerceEnabled:false`, and no Turnstile configuration. The response carried Render origin and Cloudflare headers and a request ID; no state-changing endpoint was called.

This verifies current public baseline availability only. It does not prove authenticated Resource Hub delivery or qualify the undeployed `8be5d582` candidate.
