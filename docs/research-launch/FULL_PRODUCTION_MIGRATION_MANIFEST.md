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

- RUN: applied and verified in production (migrations 1-8).
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
| 9 | research-member-billing.sql | Billing state column | PENDING | 0* | n/a | 0 | membership billing flag |
| 10 | research-agreements.sql | Agreement acceptances (append-only) | PENDING | 1 | yes | 0 | none |
| 11 | research-member-profile.sql | Profile sections | PENDING | 1 | yes | 0 | none |
| 12 | research-assessment.sql | Assessment responses | PENDING | 1 | yes | 0 | none |
| 13 | research-blueprint.sql | Blueprints (state machine) | PENDING | 1 | yes | 0 | none |
| 14 | research-plans.sql | Xenios 30/90 + plan changes | PENDING | 3 | yes | 0 | none |
| 15 | research-documents.sql | Plan documents | PENDING | 1 | yes | 0 | document rendering/storage |
| 16 | research-tracker.sql | Tracker observations | PENDING | 1 | yes | 0 | none |
| 17 | research-media.sql | Private media + access log | PENDING | 3 | yes | 0 | private media storage |
| 18 | research-questions.sql | Questions + Telegram links | PENDING | 2 | yes | 0 | Telegram for inbound |
| 19 | research-sla-events.sql | SLA escalation ledger | PENDING | 1 | yes | 0 | Infinity for emit |
| 20 | research-catalog.sql | Products + provenanced facts | PENDING | 7 | yes | 0 | commerce flag |
| 21 | research-inventory-lots.sql | Lots, quality docs, FEFO | PENDING | 5 | yes | 0 | commerce flag |
| 22 | research-orders.sql | Carts, orders, refunds | PENDING | 8 | yes | 0 | payment provider + commerce flag |
| 23 | research-subscriptions.sql | Product subscriptions | PENDING | 2 | yes | 0 | payment provider + commerce flag |
| 24 | research-fulfillment.sql | Split fulfillment, shipping | PENDING | 5 | yes | 0 | shipping + Mitch fulfillment |
| 25 | research-partners.sql | Partners, training, attribution | PENDING | 13 | yes | 0 | affiliate flags |
| 26 | research-commission-ledger.sql | Commission + credit ledgers | PENDING | 4 | yes | 0 (2 triggers) | payout provider |

*Migration 9 alters `research_members` (adds `billing_state`, widens status
check); no new table. The server reads `billing_state` defensively, so apply
order is not a hazard.

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
- A live dry-run against a scratch Postgres was NOT performed in this session;
  it is a recommended pre-apply step for the PENDING files and is the one item
  that needs a database Samuel controls. It is not a code blocker.

## Production readiness

- PENDING migrations for the member platform (10-19) are production-ready to run
  whenever Samuel approves the member platform, independent of commerce.
- PENDING migrations for commerce (20-26) are schema-ready but commerce stays
  disabled until: the production commerce dependency layer is wired (see the
  provider readiness doc), a payment processor is approved, and per-SKU purchase
  eligibility passes (currently 0 of 15; see
  docs/research-commerce/PURCHASE_ELIGIBILITY_FINAL.md).
