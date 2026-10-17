# Samuel configuration queue

Every external input the site needs, in one place, so the fleet asks once rather than
per session.

**Never put a value in this file.** Status words only: `CONFIGURED`, `MISSING`,
`INVALID`, `DISABLED`, `NOT REQUIRED`, `ROTATED`. Set secrets through the provider
dashboard, Render or Supabase secret management, OAuth, MCP, or an authenticated CLI.
Never paste a secret into Claude, Codex, a GitHub comment, a PR description, a
screenshot, or this document.

**A configured credential does not activate a feature.** Master Codex still has to
verify the exact production SHA, migration state, route authorization, a test-mode
flow, a production smoke test, and only then the feature flag.

Live status is machine-readable at `GET /api/admin/integrations/status`
(`server/integrations/status.ts`), which reports `configured` / `missing` / `invalid`
/ `disabled` / `healthy` and **never a value**. Note: that endpoint is built but **not
yet registered**, because `server/index.ts` is under another writer's lease. It does
not answer until `registerIntegrationStatusApi(app)` lands there.

## How to read the Status column

`DISABLED` means the feature is intentionally held for launch. **It is not a
credential you need to find.** Research commerce and Care clinical actions are both
held, so their credentials are listed for completeness and marked accordingly rather
than omitted, so nobody later mistakes absence for an oversight.

---

## Required now

These gate surfaces that are intended to be live.

| System | Variable | Status | Exposure | Where to get it | Dashboard destination | Expected format (no value) | Enables | Sandbox test | Production smoke | Disable / rollback | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Supabase runtime | `SUPABASE_URL` | | server-only | Supabase project settings, API | Render env | `https://<ref>.supabase.co` | every server read and write | status endpoint reports `configured` | a member sign-in succeeds | none; the site cannot serve without it | Codex-RM |
| Supabase runtime | `SUPABASE_ANON_KEY` | | **public** | Supabase project settings, API | Render env | publishable grade, `sb_publishable_…` or legacy JWT | browser session verification | status endpoint reports `configured`, not `invalid` | anonymous page load works | none | Codex-RM |
| Supabase runtime | `SUPABASE_SERVICE_ROLE_KEY` | | server-only | Supabase project settings, API | Render env | secret grade, `sb_secret_…` or legacy JWT | server writes that bypass RLS | boot self-test logs service-role confirmed | an admin read returns rows | none | Codex-RM |
| Research gateway | `RESEARCH_SESSION_SECRET` | | server-only | generate a high-entropy random string | Render env | long random string | the gated Research session cookie | sign-in issues a cookie | session survives a reload | rotating signs everyone out | Codex-RM |
| Research gateway | `RESEARCH_ACCESS_PASSWORD` | | server-only | Samuel chooses | Render env | passphrase | the wall in front of Research while private | wall accepts it | wall rejects a wrong value | set `RESEARCH_PUBLIC=true` to remove the wall | Samuel |
| Email | `RESEND_API_KEY` | | server-only | Resend dashboard, API keys | Render env | provider key | application, approval and notification email | sandbox send succeeds | a real application email arrives | unset queues mail instead of sending | Codex-AUTH-ADMIN |
| Email | `RESEARCH_EMAIL_FROM` | | server-only | Samuel chooses, must be a verified domain | Render env | `name@domain` | the From address | status endpoint reports `configured` | inbound mail shows the right sender | — | Codex-AUTH-ADMIN |
| Email | `RESEARCH_EMAIL_REPLY_TO` | | server-only | Samuel chooses | Render env | `name@domain` | the Reply-To address | — | reply lands in the right inbox | — | Codex-AUTH-ADMIN |
| Turnstile | `TURNSTILE_SECRET_KEY` | | server-only | Cloudflare Turnstile dashboard | Render env | provider secret | server-side human verification | a sandbox token verifies | a real form submission passes | — | Codex-AUTH-ADMIN |
| Turnstile | `TURNSTILE_SITE_KEY` | | **public** | Cloudflare Turnstile dashboard | Render env | provider site key | rendering the widget | widget renders locally | widget renders in production | — | Codex-AUTH-ADMIN |
| Admin access | `ADMIN_EMAIL` | | server-only | Samuel chooses | Render env | address, or a list | the admin allowlist | a non-admin is refused | an admin reaches the console | — | Samuel |
| Site | `SITE_URL` | | server-only | the production hostname | Render env | `https://host` | absolute links in email and redirects | links resolve locally | an emailed link opens the right host | — | Codex-RM |
| Media storage | `RESEARCH_PRODUCT_MEDIA_BUCKET` | | server-only | Supabase storage | Render env | bucket name, not a credential | product image storage and signed delivery | signed URL resolves | a product image renders | — | Codex-IMAGES |
| Media storage | `RESEARCH_COA_BUCKET` | | server-only | Supabase storage | Render env | bucket name | COA document storage | signed URL resolves | a COA opens for an admin | — | Codex-IMAGES |

---

## Held: not needed for this launch

Listed so their absence is a decision on the record rather than a gap.

| System | Variable | Status | Held by | Notes |
|---|---|---|---|---|
| Payments | `PAYMENTS_PROVIDER` | `DISABLED` | `NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED` | Research commerce is held. Also blocked independently: no product currently has an approved price, an attached COA, or written commerce approval. |
| Payments | `PAYMENT_INSTRUCTIONS_ENC_KEY` | `DISABLED` | commerce flag | Encrypts stored payout instructions. |
| Care / Tebra | `CARE_TEBRA_BASE_URL` | `DISABLED` | `CARE_TEBRA_SCHEDULING_ENABLED` | Care is held and all five clinical capability flags are false. Unconfigured Tebra must never fabricate a scheduling confirmation; the concierge fallback is the intended path. |
| Care / Tebra | `CARE_TEBRA_API_KEY` | `DISABLED` | `CARE_TEBRA_SCHEDULING_ENABLED` | Held with Care. |
| Shipping | `SHIPPING_API_BASE_URL` | `DISABLED` | `RESEARCH_LIVE_SHIPPING_ENABLED` | `RESEARCH_SHIPPING_DISABLED` is a separate emergency stop. |
| Shipping | `SHIPPING_API_AUTH_HEADER` | `DISABLED` | `RESEARCH_LIVE_SHIPPING_ENABLED` | Held with shipping. |

---

## Needs a decision before it can be queued

The fleet protocol names these as required systems. **This repository has no canonical
variable for them**, so no name is given here. Inventing one would send Samuel to a
dashboard to create a secret that no code reads.

| System | Finding | Decision needed |
|---|---|---|
| Error monitoring (Sentry) | No DSN variable is read anywhere in `server/` or `shared/`. | Is error monitoring wired under a different name, or genuinely absent? If absent, whether it is a launch blocker is a founder call, not an engineering one. |
| Google service account and Sheet IDs | No service-account or sheet-id variable is read. `RESEARCH_GOOGLE_WORKSPACE_EXPORTS_ENABLED` exists, so the feature is anticipated but its credentials are unnamed. | Confirm whether reporting sync is in scope for this launch. If held, it belongs in the Held table instead. |
| DNS | Not an application credential; owned at the hosting provider. | Confirm the production hostname and who controls the zone. |
| GitHub and Render access | Already in use by the fleet. | No action unless a token needs rotating. |
| Supabase migration access | Distinct from the runtime service-role key. | Confirm master Codex holds it, since migration application is its sole authority. |
| Test accounts | Synthetic accounts per persona for role smoke tests. | Samuel to confirm which addresses may be used. **No real patient or customer data in tests.** |

---

## Rotation

If a value is ever pasted into a chat, a comment, a screenshot or a log, treat it as
disclosed and rotate it. Record `ROTATED` in Status with the date. Do not record what
it was.
