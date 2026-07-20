# Release checklist & release-state truth

## Release-state booleans (report independently — never collapse to "launched")

```
CODE_COMPLETE                          = false  (lanes in progress)
DEPLOYABLE_WITH_DISABLED_CAPABILITIES  = TRUE   (main @ 87150f4 boots, flags false)
BASE_SITE_DEPLOYED                     = Samuel/Render
EMAIL_ENABLED                          = false  (needs Resend domain + env)
IDENTITY_ENABLED                       = false  (needs provider)
BILLING_ENABLED                        = false  (needs Stripe)
COMMERCE_ENABLED                       = false  (needs Stripe + webhook)
TELEGRAM_ENABLED                       = false  (needs token)
SHIPPING_ENABLED                       = false  (needs carrier)
PAYOUTS_ENABLED                        = false  (needs processor)
```

## Release gates (every PR before merge)

tests · typecheck · build · migration review (drafted, not run) · security ·
accessibility · legal status · processor · identity · supplier · carrier ·
support readiness.

## Verification matrix (G12 — scripts to create in a later coordinator PR)

production boot smoke · route smoke · authorization matrix · member-state
matrix · admin-state matrix · recovery regression · tenant isolation ·
capability-disabled behavior · fixture-leakage scan · secret scan · PII/log
scan · broken-link scan · accessibility evidence · screenshot inventory ·
migration-manifest validation.

Representative states to prove: signed out · applicant pending · info
requested · approved/identity pending · agreements pending · activation
pending · active member · cancelled member · Samuel admin · affiliate
applicant · certified partner · suspended partner.

## Environment matrix (names only — never values; Samuel sets in Render)

- base site: RESEARCH_ACCESS_PASSWORD, RESEARCH_SESSION_SECRET, SUPABASE_URL,
  SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SITE_URL, ADMIN_EMAIL.
- email: RESEND_API_KEY, RESEARCH_EMAIL_FROM, RESEARCH_EMAIL_REPLY_TO
  (+ Resend domain verified; Supabase reset-redirect allowlisted).
- private storage: Supabase storage bucket + signed-URL config.
- identity: provider account + webhook secret + RESEARCH_IDENTITY_VERIFICATION_ENABLED.
- billing: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, price IDs +
  RESEARCH_MEMBERSHIP_BILLING_ENABLED.
- Telegram: TELEGRAM_BOT_TOKEN + chat map.
- shipping: carrier account/contract creds.
- Mitch: fulfillment API creds + supplier data.
- affiliate payouts: payout-processor creds.

## Migration order (drafted; Samuel runs)

research-member-billing.sql is PENDING (drafted in PR #25). New lanes append
their .sql to supabase/ and MIGRATIONS.md; no agent runs SQL.
