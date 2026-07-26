# Full Production Migration Manifest

The single ordered manifest for a production Supabase apply of the integrated
Xenios Research schema. Do NOT run production SQL blindly. This is the reviewed
order; Samuel pastes it into the Supabase SQL Editor after review.

## Validation summary (all 26 files, scanned 2026-07-21)

- Every table uses `create table if not exists` (idempotent, safe to re-run).
- Every table enables row level security. Zero `create policy` statements
  anywhere: the schema is service-role only by design. Adding a public policy
  to any research table is a security regression.
- No destructive DDL (`drop table`, `truncate`, `delete from`) at migration
  level. The one `delete from` in the codebase is a rate-limit garbage
  collector inside `research_rate_limit_hit` (migration 8, already run).
- Append-only enforcement: `research-commission-ledger.sql` installs two
  triggers that block UPDATE and DELETE on the commission and store-credit
  ledgers.

## Status legend

- RUN: applied and verified in production.
- PENDING: drafted, reviewed here, not yet run.

## Ordered manifest

| # | File | Domain | Status | Tables | RLS | Policies | Provider/flag gate before use |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | schema.sql | Main site (waitlist, LOI, bookings) | RUN | 5 | yes | 0 | none |
| 2 | research-membership.sql | Applications + event audit | RUN | 2 | yes | 0 | none |
| 3 | research-notification-outbox.sql | Email outbox + attempts + prefs | RUN | 4 | yes | 0 | Resend for delivery |
| 4 | research-members.sql | Member accounts | RUN | 1 | yes | 0 | none |
| 5 | research-referrals.sql | Programs, identities, rewards, credit | RUN | 5 | yes | 0 | referrals flag |
| 6 | research-referrals-seed.sql | Seed referral program | RUN | 0 | n/a | 0 | none |
| 7 | research-consent-covenant.sql | Consent events + covenant | RUN | 2 | yes | 0 | none |
| 8 | research-referral-fraud.sql | Fraud queue + rate-limit fn | RUN | 3 | yes | 0 | none |
| 9 | research-member-billing.sql | Billing state column | RUN | 0* | n/a | 0 | membership billing flag |
| 10 | research-agreements.sql | Agreement acceptances (append-only) | RUN | 1 | yes | 0 | none |
| 11 | research-member-profile.sql | Profile sections | RUN | 1 | yes | 0 | none |
| 12 | research-assessment.sql | Assessment responses | RUN | 1 | yes | 0 | none |
| 13 | research-blueprint.sql | Blueprints (state machine) | RUN | 1 | yes | 0 | none |
| 14 | research-plans.sql | Xenios 30/90 + plan changes | RUN | 3 | yes | 0 | none |
| 15 | research-documents.sql | Plan documents | RUN | 1 | yes | 0 | document rendering/storage |
| 16 | research-tracker.sql | Tracker observations | RUN | 1 | yes | 0 | none |
| 17 | research-media.sql | Private media + access log | RUN | 3 | yes | 0 | private media storage |
| 18 | research-questions.sql | Questions + Telegram links | RUN | 2 | yes | 0 | Telegram for inbound |
| 19 | research-sla-events.sql | SLA escalation ledger | RUN | 1 | yes | 0 | Infinity for emit |
| 20 | research-catalog.sql | Products + provenanced facts | RUN | 7 | yes | 0 | commerce flag |
| 21 | research-inventory-lots.sql | Lots, quality docs, FEFO | RUN | 5 | yes | 0 | commerce flag |
| 22 | research-orders.sql | Carts, orders, refunds | PENDING | 8 | yes | 0 | payment provider + commerce flag |
| 23 | research-subscriptions.sql | Product subscriptions | PENDING | 2 | yes | 0 | payment provider + commerce flag |
| 24 | research-fulfillment.sql | Split fulfillment, shipping | PENDING | 5 | yes | 0 | shipping + Mitch fulfillment |
| 25 | research-partners.sql | Partners, training, attribution | PENDING | 13 | yes | 0 | affiliate flags |
| 26 | research-commission-ledger.sql | Commission + credit ledgers | PENDING | 4 | yes | 0 (2 triggers) | payout provider |

*Migration 9 alters `research_members` (adds `billing_state`, widens status
check); no new table. The server reads `billing_state` defensively, so apply
order is not a hazard.

## Applied post-base operational sequence

These migrations are already present in production and sit outside the
original 1-26 base bundle:

| Order | File | Production status | Dependency |
| --- | --- | --- | --- |
| FM-1 | production/research-founding-membership.sql | RUN; presence verified 2026-07-25 | migrations 1-19 |
| FM-2 | research-fm-esign-native.sql | RUN 2026-07-24 | FM-1 |
| FM-3 | research-fm-esign-native-hardening.sql | RUN 2026-07-24 | FM-2 |
| FM-4 | research-fm-esign-native-attempt-lease.sql | RUN 2026-07-24 | FM-3 |
| FM-5 | research-idempotency-keys.sql | RUN 2026-07-24 | base Research schema |
| FM-6 | research-fm-activation-verify-atomic.sql | RUN 2026-07-24 | FM-1 + FM-5 |
| FM-7 | research-agreement-package-notifications.sql | RUN 2026-07-25 (`20260725225920`) | FM-1 + migration 3 |
| 27 | research-product-requests.sql | RUN 2026-07-25 | migrations 1-19 |
| 28 | research-product-requests-hardening.sql | RUN 2026-07-25 | 27 |
| 29 | research-product-requests-function-hardening.sql | RUN 2026-07-25 | 27 |
| 30 | research-security-definer-grants-hardening.sql | RUN 2026-07-25 (`20260725231517`) | independent privilege hardening |
| 31 | research-products-diagnostics.sql | RUN 2026-07-25 | 4 + 20 + 21 |
| 32 | research-prelaunch-foundation.sql | RUN 2026-07-25 (`canonical_prelaunch_foundation`) | Supabase Auth + admin boundary |
| 33 | research-required-input-readiness.sql | PENDING independent review/apply | 32 |

The exact FM-1 apply date is not in the managed migration-history stream, so
the manifest records verified presence instead of inventing a timestamp.
Commerce migrations 20-26 remain absent and must not be implied by the
presence of FM or Product Request objects.

## Dependency order notes

- 10-19 (member platform) are mutually independent; the server reads each table
  defensively (a missing table degrades to an empty state), so any subset can be
  applied without breaking a deploy.
- 20-26 (commerce) must run in listed order: 22 and 26 reference concepts from
  20 and 21. Nothing in the running server queries these tables yet (commerce
  services use injected repositories), so there is no live deploy-order hazard.

## Rollback / recovery

- Every file is idempotent, so re-running is safe and is the primary recovery
  path for a partial apply.
- There is no destructive DDL, so a failed apply leaves existing data intact.
- A true rollback (dropping the new tables) is a manual, reviewed operation and
  should only follow a decision to abandon a domain; it is never part of a
  routine deploy. Because all research tables are service-role-only with no
  application dependency until their lane is wired and flagged on, an unused new
  table is inert and safe to leave in place.

## Dry-run result

- Static scan: PASS (idempotency, RLS present, zero policies, no destructive
  DDL) across all 26 files.
- Live scratch-Postgres dry-run: PASS. All 26 migrations applied in order to a
  throwaway PostgreSQL 16 with 0 failures; 69 research tables created, all
  RLS-enabled, 0 policies; the append-only ledger triggers physically reject
  UPDATE and DELETE; and an idempotent re-apply of the full-production bundle
  returned 0 errors. Full detail in `MIGRATION_DRY_RUN_REPORT.md`. Applying the
  reviewed SQL to the production Supabase project remains Samuel's action.

## Production readiness

- Migrations 9-19 are present in production. Release discovery on 2026-07-25
  verified the billing column/constraint plus every expected member-platform
  table, with RLS on and zero Research policies. The original application date
  is not present in the managed migration-history stream.
- FM-7 and migration 30 are present in managed production migration history.
  Post-apply verification confirmed FM-7 RLS/grants/triggers and confirmed that
  PUBLIC, `anon`, and `authenticated` cannot execute the internal
  `public.rls_auto_enable()` event-trigger helper. The Supabase security advisor
  no longer reports that security-definer privilege finding.
- Migration 31 reuses `research_products`, `research_inventory_lots`, and
  `research_lot_quality_documents`; it does not create parallel product, lot,
  auth, notification, or Storage architectures. It is applied and verified
  through managed migration `release_train_1_research_products_diagnostics`.
  Production verification confirmed forced RLS, zero browser grants, private
  buckets, append-only audit, atomic biomarker confirmation, zero fabricated
  product/lot/COA/biomarker rows, and unchanged prior-record invariants.
- Migration 32 is applied as `canonical_prelaunch_foundation`. It contains only
  the disabled internal-build settings row; production has zero pre-launch
  role, namespace, access-audit, and external-action-capture rows.
- Migration 33 remains pending independent review. Its disposable PostgreSQL
  16 proof applies twice, exercises the complete required-input and launch
  lifecycle, rejects secret values and premature public enablement, preserves
  append-only audit, verifies 4/4 forced RLS and zero browser grants, and rolls
  all lifecycle rows back to zero.
- PENDING migrations for commerce (20-26) are schema-ready but commerce stays
  disabled until: the production commerce dependency layer is wired (see the
  provider readiness doc), a payment processor is approved, and per-SKU purchase
  eligibility passes (currently 0 of 15; see
  docs/research-commerce/PURCHASE_ELIGIBILITY_FINAL.md).
