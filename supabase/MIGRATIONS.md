# Supabase migration ledger

The xenios research schema is applied by pasting these files into the Supabase
SQL Editor (production project), in order. This ledger is the source of truth
for what has been run. Every file is idempotent (safe to re-run). Update this
table in the same PR that adds or changes a migration file.

| Order | File | Purpose | Status | Run date | Verified |
|---|---|---|---|---|---|
| 1 | schema.sql | Main site: waitlist, LOI, bookings, notes, gallery | RUN | pre-2026-07-17 | live site |
| 2 | research-membership.sql | Applications + event audit (12-status state machine) | RUN | 2026-07-18 | live admin queue |
| 3 | research-notification-outbox.sql | Durable email outbox, attempts, exports (disabled), admin prefs | RUN | 2026-07-18 | verify-research-schema.sql |
| 4 | research-members.sql | Member accounts bound to applications | RUN | 2026-07-18 | verify-research-schema.sql |
| 5 | research-referrals.sql | Programs, identities, attributions, rewards, credit ledger | RUN | 2026-07-18 | verify-research-schema.sql |
| 6 | research-referrals-seed.sql | Seed program member-give10-get15 (1500/1000 cents) | RUN | 2026-07-18 | verify-research-schema.sql (seed row) |
| 7 | research-consent-covenant.sql | Consent events + covenant acceptances | RUN | 2026-07-18 | verify-research-schema.sql |
| 8 | research-referral-fraud.sql | Fraud queue, referral event audit, applicant_ip, uniqueness indexes, durable rate-limit table + function | RUN | 2026-07-18 | verify-referral-fraud.sql |
| 9 | research-member-billing.sql | Member statuses past_due/cancelled + separate billing_state column | PENDING (not run) | — | code tolerates absence; see notes |
| 10 | research-catalog.sql | Products, provenanced supplier facts, goal + guide links, prohibited claims, open supplier questions, supplement candidates | PENDING (not run) | — | — |
| 11 | research-inventory-lots.sql | Lots, per-lot quality documents, excursions, FEFO allocations, lot-to-order shipment traceability | PENDING (not run) | — | — |
| 12 | research-orders.sql | Carts, orders, order lines, state events, webhook replay events, claims, durable refund keys | PENDING (not run) | — | — |
| 13 | research-subscriptions.sql | Product subscriptions (30/60/90) + append-only subscription events | PENDING (not run) | — | — |
| 14 | research-fulfillment.sql | Split fulfillment orders, shipments, shipping quotes with provenance, shipping profiles | PENDING (not run) | — | — |
| 15 | research-partners.sql | Partners, agreements, training, lifecycle, links, attribution, conversions, organizations, events, content assets, violations | PENDING (not run) | — | — |
| 16 | research-commission-ledger.sql | Append-only commission + store-credit ledgers (UPDATE/DELETE blocked by trigger), payout batches and attempts | PENDING (not run) | — | — |

Verification files (read-only, run any time):

- `verify-research-schema.sql` — all 14 research tables exist, RLS on, zero
  public policies, referral seed values correct.
- `verify-referral-fraud.sql` — the fraud tables, uniqueness and queue indexes,
  the applicant_ip column, and the research_rate_limit_hit function.

Notes:

- 2026-07-18: migrations 2-7 were confirmed by a code-to-schema cross-check
  (every table and column the server queries exists; zero mismatches) plus
  Samuel running the combined SQL in production.
- 2026-07-18: migration 8 run by Samuel; his run returned the three new tables
  (referral_events, referral_fraud_flags, research_rate_limits). The
  remaining pieces (indexes, applicant_ip, the function) are covered by
  verify-referral-fraud.sql.
- All research tables are service-role only by design: RLS enabled with no
  public policies. Adding a policy to any research table is a security
  regression; see docs/security.
- 2026-07-19: migration 9 drafted by CLAUDE_ACCOUNT_EMAIL_SYSTEMS. It is NOT
  run. The server code reads billing_state defensively (missing column or null
  = 'not_started'; an already-active member without the column is treated as
  verified-legacy), so deploys are safe in either order. Samuel runs it before
  RESEARCH_MEMBERSHIP_BILLING_ENABLED is ever turned on.
- 2026-07-21: migrations 10-16 drafted by the commerce and distribution lane
  (PR #31). NONE are run. They follow the service-role-only rule: RLS enabled,
  zero policies. Run them in listed order, because 12 and 16 reference concepts
  introduced by 10 and 11. Nothing in the running server queries these tables
  yet, so there is no deploy-order hazard; the commerce services are exercised
  entirely through injected in-memory repositories today.
- Constraints worth knowing before running 10-16, because they will reject data
  that older habits would have allowed:
  - research_product_facts refuses a fact marked `confirmed` without both a value
    and a supplier document or COA source. This is deliberate: 32 supplier facts
    are unconfirmed and 13 disputed, so "confirmed" has to mean something at rest.
  - research_orders refuses a payment_authorized, payment_captured, or refunded
    row without a provider reference, refuses a capture above the authorization,
    and refuses a refund above the capture.
  - research_commission_ledger and research_store_credit_ledger BLOCK UPDATE and
    DELETE via trigger. A correction must be a new row referencing the original.
    A migration that tries to backfill by UPDATE on these tables will fail, which
    is the intended behavior rather than a bug to work around.
  - research_partners has no parent, sponsor, upline, or tier column, and must
    not gain one. Recursive downline compensation is a founder-level prohibition.
