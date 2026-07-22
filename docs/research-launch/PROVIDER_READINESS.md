# Provider Readiness

Production-readiness of every external capability. No secret value appears in
this document, only variable NAMES. Credentials are requested from Samuel only
after code, migrations, tests, and activation instructions are complete and the
sandbox handshake is the final remaining node.

## Legend

- Impl: domain implementation complete.
- Disabled / Test / Real: provider variants present (disabled provider, test
  provider, real adapter or adapter shell).
- Creds: whether credentials are present in the environment.
- Flag: the feature flag that gates the capability (default false).
- Ready: capability-ready result today.

## Member platform capabilities (this session, verified)

| Capability | Impl | Disabled | Test | Real | Env var names | Creds | Flag | Ready |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Transactional email | yes | yes | yes | yes (Resend) | RESEND_API_KEY, RESEARCH_EMAIL_FROM, RESEARCH_EMAIL_REPLY_TO | present in prod (PR #25 era) | none (always on if configured) | ready when domain verified |
| Identity verification | yes | yes | yes | shell | IDENTITY_PROVIDER, IDENTITY_API_KEY, IDENTITY_WEBHOOK_SECRET | absent | RESEARCH_IDENTITY_ENABLED | disabled (truthful) |
| Private media storage | yes | yes | yes | shell | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEARCH_MEDIA_BUCKET | Supabase present; bucket absent | RESEARCH_PRIVATE_MEDIA_ENABLED | disabled |
| Telegram support | yes | yes | yes | shell | TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_BOT_USERNAME | absent | RESEARCH_TELEGRAM_ENABLED | disabled |
| Infinity events | yes | yes | yes | shell | INFINITY_EVENT_URL, INFINITY_EVENT_SECRET | absent | RESEARCH_INFINITY_ENABLED | disabled |
| Document rendering | yes | yes | yes | shell | (Supabase storage) | n/a | RESEARCH_DOCUMENT_RENDERING_ENABLED | disabled |

Every disabled state is truthful: an absent credential yields a `capability_disabled`
response, never a fabricated URL, token, or success. The member platform admin
diagnostics endpoint reports missing variable NAMES only.

## Commerce and distribution capabilities (reported by PR #31; provider variants confirmed present)

| Capability | Impl | Disabled | Test | Real | Env var names | Creds | Flag | Ready |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Membership billing | domain | yes | yes | shell | PAYMENTS_PROVIDER, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_RESEARCH_ACTIVATION, STRIPE_PRICE_RESEARCH_MEMBERSHIP | absent | RESEARCH_MEMBERSHIP_BILLING_ENABLED | disabled |
| Product commerce (payment) | domain | yes | yes | shell (Stripe) | PAYMENTS_PROVIDER, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET | absent | NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED | disabled + purchase-eligibility 0/15 |
| Shipping / carrier rates | domain | yes | yes | shell | SHIPPING_PROVIDER, SHIPPING_API_KEY, SHIP_FROM_ADDRESS_ID | absent | (commerce flag) | disabled |
| Mitch fulfillment | domain | yes | yes | shell | MITCH_FULFILLMENT_MODE, MITCH_FULFILLMENT_API_URL, MITCH_FULFILLMENT_API_KEY, MITCH_FULFILLMENT_WEBHOOK_SECRET | absent | (commerce flag) | disabled |
| Affiliate payouts | domain | yes | yes | shell | PAYOUT_PROVIDER, PAYOUT_API_KEY, PAYOUT_WEBHOOK_SECRET, PAYOUT_HOLD_DAYS | absent | RESEARCH_AFFILIATE_PAYOUTS_ENABLED | disabled |

## Core platform

| Capability | Env var names | Creds | Note |
| --- | --- | --- | --- |
| Supabase | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | present | live |
| Session / gate | RESEARCH_ACCESS_PASSWORD, RESEARCH_SESSION_SECRET | present | fail-closed without them |
| Admin | ADMIN_EMAIL=samuel@xeniostechnology.com | present | super admin |
| Bot protection | TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY | (existing) | reuse existing |
| Monitoring | SENTRY_DSN, LOG_SINK_URL | optional | redaction required; no health data to third parties |

## One outstanding integration item (not a credential)

The commerce HTTP surface (`registerCommerceApi`) is complete and tested with
injected in-memory dependencies, but a production dependency factory (real
repositories backed by migrations 20-26, plus the selected payment, shipping,
and payout adapters) is NOT yet wired into the live router. This is a build
step, not a credential, and commerce cannot be enabled until it is done AND a
processor is approved AND purchase eligibility passes. It is documented as the
next commerce integration task rather than fabricated as complete.

## Credential request format (for when a capability is otherwise ready)

```
PROVIDER:
ENVIRONMENT VARIABLE NAMES:
WHERE SAMUEL ENTERS THEM:  (Render env vars / Supabase settings / gitignored .env)
VALIDATION COMMAND:
CAPABILITY ENABLED:
```

No credential is requested in this session, because for every capability an
earlier node is still open (identity provider choice, media bucket, Telegram
bot, Infinity endpoint, payment processor approval, commerce dependency
wiring), so a key would not be the final activation node.
