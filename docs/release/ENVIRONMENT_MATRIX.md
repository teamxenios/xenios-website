# Xenios final release environment matrix

Names only. Never place values, key prefixes, masked values, or screenshots of
the Render environment on this page.

Status was reconciled from code and boolean-only production boot diagnostics on
2026-07-25. `confirmed` means production emitted an explicit set/configured
diagnostic; it does not disclose the value.

## Production foundation

| Capability | Required names | Starting status |
|---|---|---|
| Supabase server access | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | confirmed; service-role privilege check passed |
| Supabase browser auth | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | configured; response body must never be logged |
| Private Research gate | `RESEARCH_ACCESS_PASSWORD`, `RESEARCH_SESSION_SECRET` | confirmed |
| Email delivery | `RESEND_API_KEY`, `FROM_EMAIL`, `REPLY_TO_EMAIL`, `ADMIN_EMAILS`, `RESEARCH_NOTIFICATION_EMAILS`, optional `RESEARCH_EMAIL_FROM`, `RESEARCH_EMAIL_REPLY_TO` | provider/sender/reply-to confirmed |
| Canonical URLs | `SITE_URL`, optional `APPLICATION_BASE_URL` | verify before final release |
| Main-site legacy database | `DATABASE_URL` | absent; legacy `/api/waitlist` is in-memory and must not remain a production write path |

## Internal code-backed capabilities

| Capability | Gate / environment | Release rule |
|---|---|---|
| Assessment, plans, questions | Supabase foundation; server capability registry | Client fallback must not disable a working server implementation |
| Product requests | `RESEARCH_PRODUCT_REQUESTS_BUCKET`, `RESEARCH_PRODUCT_REQUEST_ADMIN_EMAILS` | Bucket private; admin allow-list required; grants hardened |
| Biomarker reports | `RESEARCH_BIOMARKER_REPORTS_BUCKET`, `RESEARCH_BIOMARKER_UPLOAD_ENABLED` | Private bucket + atomic confirmation required; disabled until migration/provider/live privacy smoke pass |
| Exact-lot COA access | `RESEARCH_COA_BUCKET`, `RESEARCH_COA_ACCESS_ENABLED` | Private bucket; data-gated and disabled until an approved exact-lot document exists |
| Affiliate portal | `RESEARCH_AFFILIATE_COMMISSIONS_ENABLED`; payout execution remains separate | UI presence is not payout readiness |
| Fulfillment portal | `RESEARCH_MITCH_FULFILLMENT_ENABLED` plus Mitch provider names below | Fail closed until provider readiness is confirmed |
| Document rendering | `RESEARCH_DOCUMENT_RENDERING_ENABLED` | Requires verified private storage path |
| Private pre-launch | Canonical Supabase settings/roles/seed namespaces; no client flag | Foundation candidate defaults to `internal_build` + provider `disabled`; no role or namespace is seeded |

## External provider-backed capabilities

| Capability | Required names / gap | Starting release status |
|---|---|---|
| Email | Names in Production foundation | configured |
| SMS | No canonical provider contract or environment names | blocked / not live |
| Telegram | `RESEARCH_TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME` | verify; default disabled |
| Superpower | Server-authoritative database configuration; no external provider credential or approved affiliate URL | Coming Soon; affiliate access disabled |
| Shipping | `RESEARCH_LIVE_SHIPPING_ENABLED`, `SHIPPING_PROVIDER`, `SHIPPING_API_BASE_URL`, `SHIPPING_API_AUTH_HEADER`, `SHIPPING_API_KEY`, `SHIPPING_WEBHOOK_SECRET`, optional `SHIPPING_TEMPERATURE_CONTROLLED_VALIDATED`, emergency `RESEARCH_SHIPPING_DISABLED` | default disabled |
| Payment | `RESEARCH_MEMBERSHIP_BILLING_ENABLED` or product-commerce gate; `PAYMENTS_PROVIDER`; provider credentials; Stripe path uses `STRIPE_PRICE_RESEARCH_ACTIVATION` and `STRIPE_PRICE_RESEARCH_MEMBERSHIP` | default disabled |
| Telehealth | No canonical provider contract or environment names | blocked / not live |
| Pharmacy | No canonical provider contract or environment names | blocked / not live |
| Identity | `RESEARCH_IDENTITY_ENABLED`, `IDENTITY_PROVIDER`, `IDENTITY_API_KEY`, `IDENTITY_WEBHOOK_SECRET`, private `RESEARCH_IDENTITY_BUCKET` where evidence is stored | default disabled |
| Private media | `RESEARCH_PRIVATE_MEDIA_ENABLED`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEARCH_MEDIA_BUCKET` | default disabled |
| Mitch fulfillment | `RESEARCH_MITCH_FULFILLMENT_ENABLED`, `MITCH_PROVIDER`, `MITCH_TRANSPORT_MODE`, `MITCH_ENDPOINT_URL`, `MITCH_API_KEY`, `MITCH_WEBHOOK_SECRET` | default disabled |
| Affiliate payouts | `RESEARCH_AFFILIATE_PAYOUTS_ENABLED`, `PAYOUT_PROVIDER`, `PAYOUT_API_BASE`, `PAYOUT_API_KEY`, `PAYOUT_WEBHOOK_SECRET`, emergency `PAYOUTS_EMERGENCY_DISABLED` | default disabled |

Internal-seed provider behavior is database-authoritative. Domain providers
must use `disabled`, `capture`, or `live`; an `internal_seed` request can never
resolve to `live`, regardless of an environment setting.

## Data-gated capabilities

| Capability | Required evidence | Starting status |
|---|---|---|
| Product commerce | Commerce migrations 20–26, product eligibility, payment, shipping, fulfillment, legal approvals | blocked; migrations absent |
| Lot-specific COAs | Commerce migrations 20-21 plus migration 31 and verified lot document records | blocked; no approved lot document data |
| Biomarker uploads | Migration 31, private bucket, server flag, consent version, object metadata/signature verification | pending production migration/privacy smoke |
| Supplements | Supplier-approved formula, facts panel, price, testing, and claims evidence | placeholders only |
| Clinician-guided metabolic pathways | Approved clinical model, boundaries, and provider seams | placeholder only |
| Care state coverage | Disabled-by-default Care architecture plus reviewed state eligibility data | not registered / not live |

## Naming defects to close before final release

- `.env.example` documents `RESEARCH_IDENTITY_VERIFICATION_ENABLED`, while the
  server capability registry reads `RESEARCH_IDENTITY_ENABLED`.
- `.env.example` documents `STRIPE_RESEARCH_MEMBERSHIP_PRICE_ID`, while the
  implemented billing provider reads `STRIPE_PRICE_RESEARCH_ACTIVATION` and
  `STRIPE_PRICE_RESEARCH_MEMBERSHIP`.
- Payment provider selection accepts both `PAYMENTS_PROVIDER` and the older
  `PAYMENT_PROVIDER`; final configuration should publish one canonical name.
- Several provider names used by code are absent from `.env.example`. Update
  the example only after the final capability contract is frozen.
