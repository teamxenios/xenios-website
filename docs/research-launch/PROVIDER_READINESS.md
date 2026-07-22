# Provider readiness

Source branch: `integration/xenios-research-full-production-launch`
Scope: every external-service adapter reachable from the research launch code.
Generated: 2026-07-21. Read-only inventory.

## What this is

A production-readiness read of each provider boundary, built by reading the
committed adapter code and `.env.example`. It reports only environment variable
NAMES. No secret value is printed, requested, or stored here. Nothing was run.

The codebase uses one consistent pattern for every provider (server/research/
providers and the *-provider.ts files):

- a Disabled implementation that is the production default and returns a
  truthful refusal, never a crash and never a fake success,
- a Test (synthetic) implementation that refuses to construct in production,
- a real adapter that is either wired or a deliberate shell that returns a
  MISCONFIGURED or PROVIDER_ERROR refusal until its body is written,
- a resolve/select function keyed off a feature flag plus required env names.

"Complete" below means the real adapter actually performs the live call.
"Partial" means the boundary, resolution, refusals, and tests are done but the
live call body is not yet written (a credential alone will not make it work).

## Readiness table

| Provider | Impl complete | Disabled exists | Test/synthetic exists | Real adapter exists | Feature flag | Webhook state | Sandbox validation | Prod validation | Capability-ready |
|----------|---------------|-----------------|-----------------------|---------------------|--------------|---------------|--------------------|-----------------|------------------|
| Supabase (database) | y | n/a (lazy guard) | n/a | y (server/supabase.ts) | none (SUPABASE_URL + SERVICE_ROLE presence) | none | done (live site) | done (live) | ready |
| Resend (email) | y | y (unavailable state) | n/a | y (server/services/email-config.ts, email.ts) | none | none (outbound send only) | n/a | partial (Render must set direct env, sender verified) | needs-credentials |
| Membership payments | partial | y (fails closed when flag off) | y (interim admin-verified attestation) | n (Phase 5 Stripe not built) | RESEARCH_MEMBERSHIP_BILLING_ENABLED | needed (Stripe) | not-done | not-done | needs-code |
| Product payments | partial | y (DisabledPaymentProvider, prod default) | y (TestPaymentProvider) | shell (StripePaymentAdapter, returns MISCONFIGURED) | NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED + PAYMENT_PROVIDER | needed (verifyWebhook contract defined, adapter unimplemented) | not-done | not-done | needs-code |
| Private storage | partial | y (disabledMediaProvider) | y (TestMediaProvider) | wired-inert (SupabaseStorageProvider, config check real, bodies return PROVIDER_ERROR) | RESEARCH_PRIVATE_MEDIA_ENABLED | none | not-done | not-done | needs-code |
| Identity verification | n | y (capability-disabled) | n | n (capability declared, no adapter code) | RESEARCH_IDENTITY_ENABLED | needed | not-done | not-done | needs-code |
| Telegram | partial | y (disabledTelegramProvider) | y (testTelegramProvider) | wired-inert (TelegramBotProvider: verifyWebhook REAL, sendMessage not wired) | RESEARCH_TELEGRAM_ENABLED | implemented (inbound verify, constant-time); outbound send not wired | not-done | not-done | needs-code |
| Shipping | partial | y (DisabledShippingProvider) | y (TestShippingProvider) | y for flat rate (ConfiguredRateShippingProvider, real $12.95 standard); shell for carrier (CarrierShippingAdapter) | RESEARCH_LIVE_SHIPPING_ENABLED (RESEARCH_SHIPPING_DISABLED to force off) | needed for live carrier (unimplemented) | not-done (live carrier) | na (flat rate needs none) | ready (flat rate); needs-code (live rates) |
| Mitch fulfillment | partial | y (DisabledMitchProvider) | y (TestMitchProvider) | shell (MitchFulfillmentProvider, transport and payload contract not agreed) | RESEARCH_MITCH_FULFILLMENT_ENABLED | needed (MITCH_WEBHOOK_SECRET) | not-done | not-done | needs-code |
| Affiliate payouts | partial | y (DisabledPayoutProvider) | y (TestPayoutProvider, plus real batching and eligibility logic) | shell (RealPayoutAdapter, returns MISCONFIGURED) | RESEARCH_AFFILIATE_PAYOUTS_ENABLED + PAYOUT_PROVIDER | needed | not-done | not-done | needs-code |
| Monitoring (Infinity events) | partial | y (disabledInfinityProvider) | y (testInfinityProvider) | wired-inert (SignedHttpInfinityProvider: HMAC signing REAL, transport returns PROVIDER_ERROR) | RESEARCH_INFINITY_ENABLED | outbound signed HTTP (receiver side); not wired | not-done | not-done | needs-code |
| Bot protection (Turnstile) | y | y (skips verify when secret absent) | n | y (server/turnstile.ts) | none (TURNSTILE_SECRET_KEY presence) | none | n/a | partial (functional but open until key set) | needs-credentials |

Notes on scope. "Monitoring" in this codebase means the Infinity operational
event provider (SLA at-risk and breach notifications sent to Infinity). There is
NO application performance monitoring or error-tracking provider in the tree
(no Sentry, Datadog, New Relic, or OpenTelemetry env or code was found). If APM
or error tracking is wanted for launch, it is net-new work, not a credential.
"Membership payments" and "Product payments" are two separate flows that happen
to share Stripe keys: membership activation is handled inline in
server/research/membership.ts (interim admin-verified now, Stripe Phase 5),
while product commerce goes through the payment provider boundary in
server/research/providers/payment.ts.

## Provider-by-provider summary

- Supabase. Real client in server/supabase.ts, lazily constructed so a missing
  key cannot crash boot. supabaseConfigured() gates every Supabase route. There
  is a first-use self-test that logs whether the SERVICE_ROLE key actually has
  service-role privileges, because a publishable key in the service slot is a
  silent failure (RLS reads return empty, writes 500). This provider is live.

- Resend. Resolver in server/services/email-config.ts tries direct env first
  (the production path on Render), then the legacy Replit connector, then a
  truthful "unavailable" state. Needs RESEND_API_KEY set directly on Render and
  a verified sender for RESEARCH_EMAIL_FROM.

- Product payments. The boundary, refusals, idempotency, and webhook-verify
  contract are complete and tested. The live StripePaymentAdapter is a shell:
  every method returns MISCONFIGURED so an accidental enablement fails loudly
  and never half-creates a paid order. It needs the adapter body written AND a
  processor decision AND the peptide-commerce written approval, then keys.

- Private storage, Telegram, Monitoring (Infinity). All three follow the same
  "wired but inert" shape: resolution and the safety-critical pure parts are
  real (Telegram webhook verify is a real constant-time check, Infinity request
  signing is a real HMAC, media config validation is real), but the actual
  network body returns PROVIDER_ERROR until a later wave writes it. Each needs
  code first, then credentials.

- Shipping. Unusual and good: the default is ConfiguredRateShippingProvider,
  which quotes the real admin-configured flat standard rate honestly and refuses
  anything a carrier would be needed for. That path needs no credential and is
  ready for a flat-rate launch. Live carrier rates and label buying are a shell
  (CarrierShippingAdapter) that needs code plus SHIPPING_API_KEY.

- Mitch fulfillment. Shell only. The comment is explicit that transport and
  payload contract are not agreed, so this needs the supplier integration
  designed and built before credentials are useful.

- Affiliate payouts. The eligibility and batching math is real and tested (fails
  closed, rounds down, names every exclusion reason). The live rail
  (RealPayoutAdapter) is a shell and also requires written approval for live
  partner payouts.

- Bot protection (Turnstile). Real verification in server/turnstile.ts. Without
  TURNSTILE_SECRET_KEY it skips verification and returns true so the forms keep
  working (the honeypot and rate limiter still run). So it is functional today
  but unprotected until the secret is set.

## Credential request blocks

The following providers need Samuel to add credentials before their capability
can be enabled. These are the env var NAMES only. No values appear here, and
none should be pasted into chat, Git, Markdown, or logs. Enter them in the
service's own secure input (Render environment for the app, the Supabase
dashboard for the storage bucket, the provider dashboards for keys).

Providers that also need CODE first (payments, private storage, identity,
telegram send, live shipping carrier, Mitch, payouts, Infinity transport) are
listed too, so the credential names are on record, but their capability will not
flip on credentials alone. That is called out in each block.

PROVIDER: Resend (email)
ENVIRONMENT VARIABLE NAMES: RESEND_API_KEY, FROM_EMAIL, REPLY_TO_EMAIL, RESEARCH_EMAIL_FROM, RESEARCH_EMAIL_REPLY_TO, ADMIN_EMAILS, RESEARCH_NOTIFICATION_EMAILS
WHERE SAMUEL ENTERS THEM: Render environment (direct env is the production path); the sending domain or exact address in RESEARCH_EMAIL_FROM must be verified in the Resend dashboard first
VALIDATION COMMAND: send a lifecycle email through a staging application flow and confirm delivery, or read the resolveEmailConfiguration provider result in server/services/email-config.ts (expect provider "resend-env", not "unavailable")
CAPABILITY ENABLED: email delivery becomes live once RESEND_API_KEY is set and the sender is verified (no separate flag; "unavailable" is the disabled state)

PROVIDER: Supabase (database, already live)
ENVIRONMENT VARIABLE NAMES: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
WHERE SAMUEL ENTERS THEM: Render environment; keys come from the Supabase dashboard (new API-key format: sb_publishable_ into SUPABASE_ANON_KEY, sb_secret_ into SUPABASE_SERVICE_ROLE_KEY)
VALIDATION COMMAND: watch the server log on first request for "[supabase] service key check ok"; if it prints "SERVICE KEY CHECK FAILED" the wrong-grade key is in the service slot
CAPABILITY ENABLED: all Supabase-backed routes (supabaseConfigured() gate); already validated live

PROVIDER: Bot protection (Cloudflare Turnstile)
ENVIRONMENT VARIABLE NAMES: TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY
WHERE SAMUEL ENTERS THEM: Render environment; keys from the Cloudflare Turnstile dashboard (site key is public, secret key is server-only)
VALIDATION COMMAND: submit a gated form and confirm verifyTurnstile in server/turnstile.ts calls the siteverify endpoint and returns based on the token (rather than the skip-when-absent shortcut)
CAPABILITY ENABLED: form bot verification turns on the moment TURNSTILE_SECRET_KEY is present (no flag; absent secret means verification is skipped)

PROVIDER: Product payments (Stripe) [needs CODE first: StripePaymentAdapter body]
ENVIRONMENT VARIABLE NAMES: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and the selector env NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED, PAYMENT_PROVIDER
WHERE SAMUEL ENTERS THEM: Render environment; keys from the Stripe dashboard; the webhook secret from the Stripe webhook endpoint configuration
VALIDATION COMMAND: after the adapter body is implemented, run against Stripe test mode and confirm authorize, capture, refund, and verifyWebhook all return provider references; resolvePaymentProvider must return StripePaymentAdapter (not Disabled)
CAPABILITY ENABLED: NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED=true plus PAYMENT_PROVIDER=stripe (blocked until the adapter is written and the peptide-commerce written approval exists)

PROVIDER: Membership payments (Stripe, Phase 5) [needs CODE first: Stripe activation path]
ENVIRONMENT VARIABLE NAMES: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_RESEARCH_MEMBERSHIP_PRICE_ID, RESEARCH_MEMBERSHIP_BILLING_ENABLED
WHERE SAMUEL ENTERS THEM: Render environment; keys and the price id from the Stripe dashboard
VALIDATION COMMAND: apply supabase/research-member-billing.sql first, then exercise activation in Stripe test mode and confirm a member reaches status active with billing_state active off a verified webhook (not the interim attestation)
CAPABILITY ENABLED: RESEARCH_MEMBERSHIP_BILLING_ENABLED=true (today this only unlocks the interim admin-verified flow; the Stripe path is not built yet)

PROVIDER: Private storage (Supabase Storage) [needs CODE first: SupabaseStorageProvider bodies]
ENVIRONMENT VARIABLE NAMES: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEARCH_MEDIA_BUCKET, RESEARCH_PRIVATE_MEDIA_ENABLED
WHERE SAMUEL ENTERS THEM: Render environment for the flag and bucket name; create the private bucket in the Supabase dashboard (Supabase URL and service role already set)
VALIDATION COMMAND: after the storage adapter is wired, call the admin capability diagnostics endpoint /api/admin/research/capabilities and confirm private_media state "enabled"; a signed upload and download round trip should succeed
CAPABILITY ENABLED: RESEARCH_PRIVATE_MEDIA_ENABLED=true with the bucket present (capabilityEnabled("private_media"))

PROVIDER: Telegram [needs CODE first: TelegramBotProvider sendMessage body]
ENVIRONMENT VARIABLE NAMES: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_BOT_USERNAME, RESEARCH_TELEGRAM_ENABLED
WHERE SAMUEL ENTERS THEM: Render environment; the bot token and username from BotFather; the webhook secret is a value Samuel generates and also configures on the Telegram setWebhook call
VALIDATION COMMAND: /api/admin/research/capabilities should show telegram_support "enabled"; webhook verify already works, so confirm an inbound update is accepted and, after the send body is wired, an outbound reply is delivered
CAPABILITY ENABLED: RESEARCH_TELEGRAM_ENABLED=true with all three env names present (capabilityEnabled("telegram_support"))

PROVIDER: Live shipping carrier [needs CODE first: CarrierShippingAdapter body]
ENVIRONMENT VARIABLE NAMES: RESEARCH_LIVE_SHIPPING_ENABLED, SHIPPING_PROVIDER, SHIPPING_API_KEY (and RESEARCH_SHIPPING_DISABLED to force the disabled path)
WHERE SAMUEL ENTERS THEM: Render environment; the carrier API key from the chosen carrier account
VALIDATION COMMAND: resolveShippingProvider must return CarrierShippingAdapter; then confirm a live quote and a label buy return a real carrier reference (the flat-rate ConfiguredRate path needs none of this and works today)
CAPABILITY ENABLED: RESEARCH_LIVE_SHIPPING_ENABLED=true plus SHIPPING_PROVIDER set to the carrier (not "configured" or "test")

PROVIDER: Mitch fulfillment [needs CODE first: MitchFulfillmentProvider body and agreed transport/payload contract]
ENVIRONMENT VARIABLE NAMES: RESEARCH_MITCH_FULFILLMENT_ENABLED, MITCH_PROVIDER, MITCH_TRANSPORT_MODE, MITCH_ENDPOINT, MITCH_API_KEY, MITCH_WEBHOOK_SECRET
WHERE SAMUEL ENTERS THEM: Render environment; the endpoint, key, and webhook secret from the agreed Mitch integration
VALIDATION COMMAND: resolveFulfillmentProvider must return MitchFulfillmentProvider; then confirm an order submission is accepted and a status webhook is verified against MITCH_WEBHOOK_SECRET
CAPABILITY ENABLED: RESEARCH_MITCH_FULFILLMENT_ENABLED=true with MITCH_PROVIDER set (blocked until the transport and payload contract are agreed and built)

PROVIDER: Affiliate payouts [needs CODE first: RealPayoutAdapter body, plus written approval]
ENVIRONMENT VARIABLE NAMES: RESEARCH_AFFILIATE_PAYOUTS_ENABLED, PAYOUT_PROVIDER, PAYOUT_API_KEY
WHERE SAMUEL ENTERS THEM: Render environment; the payout API key from the chosen payout rail
VALIDATION COMMAND: resolvePayoutProvider must return RealPayoutAdapter; then confirm a built batch settles with a provider reference in the rail's test mode (the buildBatch and eligibility logic already pass their unit tests)
CAPABILITY ENABLED: RESEARCH_AFFILIATE_PAYOUTS_ENABLED=true plus PAYOUT_PROVIDER=live (blocked until the adapter is written and live payouts are approved in writing)

PROVIDER: Monitoring (Infinity events) [needs CODE first: SignedHttpInfinityProvider transport body, plus a receiver]
ENVIRONMENT VARIABLE NAMES: INFINITY_EVENT_URL, INFINITY_EVENT_SECRET, RESEARCH_INFINITY_ENABLED
WHERE SAMUEL ENTERS THEM: Render environment; the URL and shared secret from the Infinity receiving endpoint
VALIDATION COMMAND: /api/admin/research/capabilities should show infinity_events "enabled"; the signInfinityRequest helper is testable now, so after the transport is wired confirm the receiver accepts the signed request within the replay window
CAPABILITY ENABLED: RESEARCH_INFINITY_ENABLED=true with the URL and secret present (capabilityEnabled("infinity_events"))

PROVIDER: Identity verification [needs CODE first: no adapter exists yet, plus a vendor contract and counsel-approved consent]
ENVIRONMENT VARIABLE NAMES: IDENTITY_PROVIDER, IDENTITY_API_KEY, IDENTITY_WEBHOOK_SECRET, RESEARCH_IDENTITY_ENABLED (the .env public flags RESEARCH_IDENTITY_VERIFICATION_ENABLED and RESEARCH_AGE_VERIFICATION_ENABLED also gate the surface)
WHERE SAMUEL ENTERS THEM: Render environment; keys from the chosen identity vendor once selected
VALIDATION COMMAND: /api/admin/research/capabilities will show identity_verification state; it stays pending_approval until the vendor contract and counsel-approved consent are recorded, then pending_credentials until the env names are set
CAPABILITY ENABLED: RESEARCH_IDENTITY_ENABLED=true with all three env names present (capabilityEnabled("identity_verification")); this is the least-built provider (no test or real adapter code yet)

## Other env-gated integrations found (not in the requested twelve)

For completeness, these appear in server code or .env.example and are worth a
glance during launch, but were outside the requested provider set:

- Calendly booking webhook: CALENDLY_WEBHOOK_SECRET, CALENDLY_URL (server/routes.ts).
- Meta Pixel analytics: META_PIXEL_ID (public, browser).
- Order dispatch webhook (Quantum fulfillment adapter): ORDER_WEBHOOK_URL, ORDER_WEBHOOK_SECRET (server/research/index.ts).
- Google Workspace archival exports: RESEARCH_GOOGLE_WORKSPACE_EXPORTS_ENABLED, GOOGLE_SERVICE_ACCOUNT_JSON_B64, GOOGLE_DRIVE_APPLICATIONS_FOLDER_ID, GOOGLE_SHEETS_APPLICATION_INDEX_ID, GOOGLE_WORKSPACE_ADMIN_EMAIL (disabled by default; Supabase stays canonical).
- Admin API access: ADMIN_API_KEY, ADMIN_EMAIL.
- Session and gate secrets for the research surface: RESEARCH_SESSION_SECRET, RESEARCH_ACCESS_PASSWORD, RESEARCH_QUEUE_REF_SALT (required in production for the surface to serve).
