# Full production migration manifest

Source branch: `integration/xenios-research-full-production-launch`
Scope: every SQL file under `supabase/` on that branch.
Generated: 2026-07-21. Read-only inventory.

## Dry-run notice (read this first)

NO SQL WAS RUN to produce this document, and none should be run without
Samuel's review. This is a static inventory built by reading committed files
with `git show`. Nothing here connects to a database. The apply sequence at the
bottom is a proposal for Samuel to paste by hand into the Supabase SQL Editor,
one file at a time, after he has read each file. Do not automate it.

Counts: 27 schema-applying files (1 base plus 26 research migrations), plus 2
read-only verification files. Every file is written to be idempotent (safe to
re-run). Eight are already run in production (orders 1 to 8 in the table). The
rest are pending.

## Migration inventory (ordered)

Order matches `supabase/MIGRATIONS.md`, which is the integration order and the
correct apply order. "Dep" is the earliest migration that must already be
applied. Domains: base = main marketing site, mem = membership and applications,
notif = notifications and email, referral = referrals and credit, consent =
consent and covenant, member-platform = the logged-in member product, commerce =
products, orders, fulfillment, distribution.

| # | File | Domain | Dep | Tables | Idx | Trig | RLS | Append-only | Destructive stmts | Provider | Feature flag (gate) | Readiness |
|---|------|--------|-----|--------|-----|------|-----|-------------|-------------------|----------|--------------------|-----------|
| 1 | schema.sql | base | none | 5 | y | no | y | no | none | Supabase | none | ready (RUN) |
| 2 | research-membership.sql | mem | none | 2 | y | no | y | y (events, by convention) | none | Supabase | RESEARCH_PUBLIC / RESEARCH_ACCESS_PASSWORD gate the surface, not the DDL | ready (RUN) |
| 3 | research-notification-outbox.sql | notif | 2 (soft) | 4 | y | no | y | y (attempts, by convention) | none | Resend, Google Workspace (exports disabled) | RESEARCH_GOOGLE_WORKSPACE_EXPORTS_ENABLED (exports only) | ready (RUN) |
| 4 | research-members.sql | mem | 2 (FK) | 1 | y | no | y | no | none | Supabase Auth | none | ready (RUN) |
| 5 | research-referrals.sql | referral | none | 5 | y | no | y | y (member_credit_ledger, by convention) | none | none (inert until flag) | RESEARCH_REFERRALS_ENABLED | ready (RUN) |
| 6 | research-referrals-seed.sql | referral | 5 | 0 (seed row) | n | no | n/a | n/a | none (INSERT ON CONFLICT DO NOTHING) | none | RESEARCH_REFERRALS_ENABLED | ready (RUN) |
| 7 | research-consent-covenant.sql | consent | none | 2 | y | no | y | y (both, by convention) | none | none | RESEARCH_MEMBER_COVENANT_ENABLED | ready (RUN) |
| 8 | research-referral-fraud.sql | referral | 5 and 2 (FK) | 3 (+1 ALTER, +1 function) | y | no | y | y (referral_events, by convention) | DELETE inside function body only (runtime sweep, not migration-time) | none | RESEARCH_REFERRALS_ENABLED | ready (RUN) |
| 9 | research-member-billing.sql | mem | 4 (ALTER) | 0 (ALTER only) | n | no | inherits | no | DROP CONSTRAINT IF EXISTS (re-added same statement); UPDATE backfill (scoped, idempotent) | none | RESEARCH_MEMBERSHIP_BILLING_ENABLED | needs-review |
| 10 | research-agreements.sql | member-platform | 4 (soft) | 1 | y | no | y | y (by convention) | none | none | none (defensive read) | ready (pending) |
| 11 | research-member-profile.sql | member-platform | 4 (soft) | 1 | y | no | y | no | none | none | none | ready (pending) |
| 12 | research-assessment.sql | member-platform | 4 (soft) | 1 | y | no | y | no | none | none | none | ready (pending) |
| 13 | research-blueprint.sql | member-platform | 4 (soft) | 1 | y | no | y | no | none | none | none | ready (pending) |
| 14 | research-plans.sql | member-platform | 4 (soft) | 3 | y | no | y | no | none | none | none | ready (pending) |
| 15 | research-documents.sql | member-platform | 4 (soft) | 1 | y | no | y | no | none | Supabase Storage (doc bytes) | RESEARCH_DOCUMENT_RENDERING_ENABLED | ready (pending) |
| 16 | research-tracker.sql | member-platform | 4 (soft) | 1 | y | no | y | no | none | none | none | ready (pending) |
| 17 | research-media.sql | member-platform | 4 (soft) | 3 | y | no | y | no | none | Supabase Storage (private media) | RESEARCH_PRIVATE_MEDIA_ENABLED | ready (pending) |
| 18 | research-questions.sql | member-platform | 4 (soft) | 2 | y | no | y | no | none | Telegram | RESEARCH_TELEGRAM_ENABLED | ready (pending) |
| 19 | research-sla-events.sql | member-platform | 4 (soft) | 1 | y | no | y | no | none | Infinity events | RESEARCH_INFINITY_ENABLED | ready (pending) |
| 20 | research-catalog.sql | commerce | none | 7 | y | no | y | no | none | none | NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED | needs-review |
| 21 | research-inventory-lots.sql | commerce | none | 5 | y | no | y | no | none | none | NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED | needs-review |
| 22 | research-orders.sql | commerce | 20, 21 (concept, no FK) | 8 | y | no | y | y (state_events, by convention) | none | Payment (Stripe) | NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED | needs-review |
| 23 | research-subscriptions.sql | commerce | 20 (soft) | 2 | y | no | y | y (events, by convention) | none | Payment (Stripe) | NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED | needs-review |
| 24 | research-fulfillment.sql | commerce | 20, 21, 22 (soft) | 5 | y | no | y | no | none | Mitch fulfillment, shipping carrier | RESEARCH_MITCH_FULFILLMENT_ENABLED, RESEARCH_LIVE_SHIPPING_ENABLED | needs-review |
| 25 | research-partners.sql | commerce | none | 13 | y | no | y | y (lifecycle_events, by convention) | none | Affiliate payouts (downstream) | none (attribution is inert without payouts) | needs-review |
| 26 | research-commission-ledger.sql | commerce | 20, 21, 25 (concept, no FK) | 4 | y | y (2 triggers + 1 function) | y | y (commission and store-credit ledgers, TRIGGER-ENFORCED) | DROP TRIGGER IF EXISTS (re-created same file) | Affiliate payouts | RESEARCH_AFFILIATE_PAYOUTS_ENABLED | needs-review |

Verification files (read-only, run any time after their group):

| File | Covers | When |
|------|--------|------|
| verify-research-schema.sql | 14 research tables from orders 2 to 7 exist, RLS on, zero public policies, referral seed present with correct values | after order 7 |
| verify-referral-fraud.sql | the 3 fraud tables, applicant_ip column, the uniqueness and queue indexes, the research_rate_limit_hit function | after order 8 |

## Per-migration detail

Tables and the destructive or rollback notes that did not fit the table above.

1. schema.sql (base, RUN). Tables: waitlist_signups, loi_submissions,
   calendly_bookings, admin_notes, concept_gallery_items. Extension: pgcrypto.
   Idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS). RLS on
   all five, no policies. Rollback: none needed, additive only.

2. research-membership.sql (mem, RUN). Tables: research_applications (12-status
   state machine), research_application_events (append-only audit, FK to
   applications ON DELETE CASCADE). Idempotent. Rollback: additive only.

3. research-notification-outbox.sql (notif, RUN). Tables:
   research_notification_outbox (event_key UNIQUE for idempotency),
   research_notification_attempts (FK cascade), research_external_exports
   (export tracking, disabled by default), research_admin_notification_preferences.
   Rollback: additive only.

4. research-members.sql (mem, RUN). Table: research_members (FK to
   research_applications, UNIQUE application_id and auth_user_id and email).
   Depends on order 2. Rollback: additive only.

5. research-referrals.sql (referral, RUN). Tables: referral_programs,
   referral_identities, referral_attributions (FK to identities and programs),
   referral_rewards (FK to attributions, idempotency_key UNIQUE),
   member_credit_ledger (append-only by convention, no trigger). Rollback:
   additive only.

6. research-referrals-seed.sql (referral, RUN). No DDL. One INSERT into
   referral_programs (code member-give10-get15, 1500/1000 cents) with ON
   CONFLICT (code) DO NOTHING. The program row does nothing until
   RESEARCH_REFERRALS_ENABLED is true. Rollback: delete the seed row by code.

7. research-consent-covenant.sql (consent, RUN). Tables:
   research_consent_events (append-only, withdrawal is a new row),
   research_covenant_acceptances (UNIQUE member+version). Rollback: additive only.

8. research-referral-fraud.sql (referral, RUN). Tables: referral_events
   (append-only audit), referral_fraud_flags, research_rate_limits. Also: ALTER
   referral_attributions ADD COLUMN IF NOT EXISTS applicant_ip; two partial
   UNIQUE indexes (one active identity per owner, one attribution per
   application); the research_rate_limit_hit(text, integer, integer) function
   (CREATE OR REPLACE). The function body contains a DELETE that sweeps expired
   rate-limit rows at call time. That DELETE is scoped (window older than one
   day, key not equal to the current key) and runs when the app calls the
   function, not when the migration is applied. Rollback: the column and
   indexes are additive; drop the function to revert.

9. research-member-billing.sql (mem, PENDING, needs-review). No new tables.
   Three statements on research_members: DROP CONSTRAINT IF EXISTS
   research_members_status_check, then ADD CONSTRAINT with the widened status
   set (adds past_due and cancelled), then ADD COLUMN IF NOT EXISTS
   billing_state with its own CHECK, then an UPDATE that sets billing_state to
   active for rows already status=active and billing_state=not_started. The
   DROP then ADD makes the constraint change idempotent (Postgres has no ADD
   CONSTRAINT IF NOT EXISTS). The UPDATE is scoped and idempotent (a second run
   matches nothing). Server code tolerates this migration being absent (missing
   billing_state reads as not_started, an active member without it is treated as
   verified-legacy), so deploy order is safe either way, but the file must be
   applied before RESEARCH_MEMBERSHIP_BILLING_ENABLED is ever turned on.
   Rollback: drop billing_state, restore the prior status CHECK. No data is
   destroyed by the forward migration.

10. research-agreements.sql (member-platform, PENDING). Table:
    research_agreement_acceptances (append-only, latest per subject+key wins,
    IP and user-agent stored as sha256 hashes only). Rollback: additive only.

11. research-member-profile.sql (member-platform, PENDING). Table:
    research_member_profile_sections (one row per member+section, section_key
    CHECK, UNIQUE member+section). Rollback: additive only.

12. research-assessment.sql (member-platform, PENDING). Table:
    research_assessment_responses (UNIQUE member+definition+mode, answers jsonb).
    Rollback: additive only.

13. research-blueprint.sql (member-platform, PENDING). Table:
    research_blueprints (8-state machine, UNIQUE member+version). Rollback:
    additive only.

14. research-plans.sql (member-platform, PENDING). Tables:
    research_xenios30_plans (month_label regex CHECK), research_xenios90_plans,
    research_plan_change_requests (UNIQUE member+month is the business rule for
    one included change per month). Rollback: additive only.

15. research-documents.sql (member-platform, PENDING). Table:
    research_plan_documents (checksum_sha256, storage_path is server-only,
    UNIQUE member+type+version). Rollback: additive only.

16. research-tracker.sql (member-platform, PENDING). Table:
    research_tracker_observations (six metric domains side by side, NO composite
    score column by design). Rollback: additive only.

17. research-media.sql (member-platform, PENDING). Tables:
    research_private_media (storage paths never returned to a browser),
    research_media_access_log (written before a signed URL is minted),
    research_media_retention_elections (standing preference). Rollback: additive
    only.

18. research-questions.sql (member-platform, PENDING). Tables:
    research_member_questions, research_telegram_links (link_token_hash UNIQUE;
    partial UNIQUE index for one active link per chat). MIGRATIONS.md warns not
    to relax that partial unique index. Rollback: additive only.

19. research-sla-events.sql (member-platform, PENDING). Table:
    research_sla_events (UNIQUE kind+subject_id+phase is the escalation
    idempotency guarantee; subject_id is NOT NULL on purpose). MIGRATIONS.md
    warns not to relax that constraint. Rollback: additive only.

20. research-catalog.sql (commerce, PENDING, needs-review). Tables:
    research_products, research_product_facts, research_product_goals,
    research_product_guide_links, research_product_prohibited_claims,
    research_product_open_questions, research_supplement_candidates. Key
    constraint research_product_facts_confirmed_needs_proof: a fact marked
    confirmed must have a value and a supplier_document or coa source. This
    constraint will REJECT loose legacy data, which is intended (it is the
    control that keeps unattached supplier facts from unlocking commerce).
    research_supplement_candidates defaults every row to not_authorized and
    blocks approved without written authorization. Rollback: additive only, but
    review the constraints before loading any legacy catalog rows.

21. research-inventory-lots.sql (commerce, PENDING, needs-review). Tables:
    research_inventory_lots (expiry_date nullable, and null blocks FEFO
    allocation on purpose), research_lot_quality_documents (tri-state sterility
    and endotoxin booleans), research_lot_excursion_events, research_lot_allocations,
    research_lot_shipments. Partial FEFO index. Rollback: additive only.

22. research-orders.sql (commerce, PENDING, needs-review). Tables:
    research_carts, research_cart_lines, research_orders, research_order_lines,
    research_order_state_events (append-only), research_provider_webhook_events
    (UNIQUE provider+event_id for replay protection), research_claims,
    research_refund_keys (durable refund idempotency). Constraints that reject
    unprovable states: paid states need a payment_reference, capture cannot
    exceed authorization, refund cannot exceed capture, checkout idempotency key
    UNIQUE per member. References product SKUs from order 20 by text, no cross-
    file FK. Rollback: additive only.

23. research-subscriptions.sql (commerce, PENDING, needs-review). Tables:
    research_product_subscriptions (active needs a schedule, cancelled must not
    keep one), research_subscription_events (append-only). Rollback: additive only.

24. research-fulfillment.sql (commerce, PENDING, needs-review). Tables:
    research_fulfillment_orders (minimum shipping identity only, no health data
    by design), research_fulfillment_lines, research_shipments,
    research_shipping_quotes (a configured fallback rate cannot carry a delivery
    promise), research_shipping_profiles (a cold-chain claim needs a validated
    service and document). Rollback: additive only.

25. research-partners.sql (commerce, PENDING, needs-review). Tables:
    research_partners (active requires every gate cleared), research_partner_agreements,
    research_partner_training, research_partner_lifecycle_events (append-only),
    research_partner_links, research_attribution_touches, research_attribution_conversions
    (UNIQUE order_id), research_organizations, research_organization_representatives,
    research_organization_events, research_organization_rsvps (opaque subject
    key, no whitespace CHECK), research_content_assets, research_content_violations.
    Founder rule encoded structurally: NO parent_partner_id, sponsor_id,
    upline_id, tier, or level column anywhere. Do not add one. Rollback:
    additive only.

26. research-commission-ledger.sql (commerce, PENDING, needs-review). Tables:
    research_commission_ledger, research_store_credit_ledger, research_payout_batches,
    research_payout_attempts. Function research_ledger_is_append_only and two
    triggers (research_commission_ledger_no_update, research_store_credit_ledger_no_update),
    each BEFORE UPDATE OR DELETE, that raise an exception. This is the only file
    that enforces append-only with a trigger rather than by convention. Each
    trigger is created with DROP TRIGGER IF EXISTS first, so the file is
    idempotent. Consequence to know: after this runs, any later migration or
    hand-run statement that tries to UPDATE or DELETE these two tables WILL
    FAIL. A correction must be a new row. Partial UNIQUE index for one live
    accrual per order. Rollback: drop the triggers and function, then the tables.

## Validation review

Per-migration checks against the requested criteria.

- SQL syntax plausibility. Every file is standard PostgreSQL and Supabase-
  flavored (public schema, pgcrypto, gen_random_uuid). No obvious syntax
  problems were found by reading. This is a read check only, not a parse or a
  dry-run against a server.

- Idempotency. All 27 schema-applying files use CREATE TABLE IF NOT EXISTS,
  CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION, ALTER TABLE ADD COLUMN
  IF NOT EXISTS, DROP CONSTRAINT IF EXISTS before ADD CONSTRAINT, DROP TRIGGER
  IF EXISTS before CREATE TRIGGER, and INSERT ON CONFLICT DO NOTHING. Re-running
  any file is safe.

- Idempotency caveat (important). CREATE TABLE IF NOT EXISTS does NOT reconcile
  an already-existing table's shape. If a table was ever created by an earlier
  draft that lacked a column or a CHECK constraint added later, re-running the
  file will not add that column or constraint (it sees the table exists and
  skips the whole statement). For the pending migrations this is not a risk
  (they have never run). For the eight already-run migrations, MIGRATIONS.md
  records that a code-to-schema cross-check was done on 2026-07-18 with zero
  mismatches. Keep that discipline: after any edit to a file that already ran,
  reconcile the live table by hand rather than trusting a re-run.

- Existing-object handling. Consistent and correct across all files (the guards
  above). The one place that needs a re-run to behave is order 9's constraint
  swap, which is handled by DROP then ADD.

- Destructive statements. There are NO DROP TABLE, DROP COLUMN, or TRUNCATE
  statements anywhere, and no unguarded top-level DELETE. The only data-affecting
  or object-dropping statements are: order 9 (DROP CONSTRAINT IF EXISTS, re-added
  in the same file, plus a scoped idempotent UPDATE backfill); order 26 (DROP
  TRIGGER IF EXISTS, re-created in the same file); and the DELETE inside order
  8's rate-limit function body, which runs at application call time, not at
  migration time, and is scoped to expired rows. None of these destroy user
  data.

- RLS and tenant isolation. Every table in every file runs ALTER TABLE ENABLE
  ROW LEVEL SECURITY and defines NO public policies. The isolation model is
  service-role-only: the anon and auth keys can read and write nothing, and all
  per-member scoping is enforced in server code, not by RLS policies. This is
  consistent across all 27 files. The two verify files assert RLS on plus zero
  policies. Adding a policy to any research table would be a security
  regression.

- Unique constraints (idempotency and integrity). Present where they matter:
  outbox event_key, referral_rewards idempotency_key, research_orders
  checkout_idempotency_key per member, research_provider_webhook_events
  (provider, event_id), research_sla_events (kind, subject_id, phase),
  research_refund_keys scope, the one-live-accrual partial index on
  research_commission_ledger, the one-active-link partial index on
  research_telegram_links, research_plan_change_requests (member, month),
  research_attribution_conversions order_id.

- State-machine constraints. Enforced by CHECK in the DDL, not left to code:
  research_applications (12 states), research_orders state, research_product_subscriptions
  state plus schedule agreement constraints, research_blueprints (8 states),
  research_partners active_is_fully_gated, research_fulfillment shipped_needs_handling.

- Ledger append-only rules. Two levels. TRIGGER-enforced on
  research_commission_ledger and research_store_credit_ledger (order 26): UPDATE
  and DELETE raise an exception. Convention-only (no trigger) on
  member_credit_ledger (order 5), and on the various *_events audit tables.
  Reconcile before enabling both referrals and commerce: see the conflict flag
  below.

## Conflicts and flags

No hard conflict was found. No table name is defined in more than one file (this
was checked by extracting every `create table if not exists public.<name>`
across all 26 research files and confirming zero duplicates). So there is no
case of two migrations defining the same table differently.

Two soft overlaps to resolve before enabling the affected surfaces. These are
not apply-order blockers, they are design questions:

- FLAG 1: two member-credit ledgers. `member_credit_ledger` (order 5,
  referrals, append-only by CONVENTION only, no trigger) and
  `research_store_credit_ledger` (order 26, commerce, append-only ENFORCED by
  trigger) both model member store credit, and both can be fed by a referral
  reward (order 5's referral_rewards and order 26's store-credit reason
  referral_new_member / referral_referrer). Before turning on referrals AND
  commerce together, confirm which ledger is canonical for spendable member
  credit, so a single referral reward cannot be booked into both. If both stay,
  document which one the checkout store-credit balance reads from.

- FLAG 2: overlapping acceptance tables. Consent lives in
  research_consent_events and research_covenant_acceptances (order 7), member
  agreements in research_agreement_acceptances (order 10), and partner
  agreements in research_partner_agreements (order 25). These are different
  scopes and do not collide at the table level. Just confirm the server writes
  each acceptance to the intended table so an audit can find it in one place.

Neither flag blocks the apply sequence. Both are safe to apply now and resolve
in code before the corresponding feature flag is flipped.

## Proposed ordered apply sequence

Paste each file into the Supabase SQL Editor in this order, one at a time, after
reading it. Orders 1 to 8 are already run in production (re-running is safe but
unnecessary). Orders 9 through 26 are pending. Do not run the commerce group
(20 to 26) until commerce is cleared for launch per the canon, and do not run 9
until just before enabling membership billing.

1. supabase/schema.sql (RUN)
2. supabase/research-membership.sql (RUN)
3. supabase/research-notification-outbox.sql (RUN)
4. supabase/research-members.sql (RUN)
5. supabase/research-referrals.sql (RUN)
6. supabase/research-referrals-seed.sql (RUN, after 5)
7. supabase/research-consent-covenant.sql (RUN)
8. supabase/research-referral-fraud.sql (RUN, after 5 and 2)
   -> then run supabase/verify-research-schema.sql and supabase/verify-referral-fraud.sql (read-only)
9. supabase/research-member-billing.sql (PENDING, needs-review, after 4, before enabling billing)
10. supabase/research-agreements.sql (PENDING)
11. supabase/research-member-profile.sql (PENDING)
12. supabase/research-assessment.sql (PENDING)
13. supabase/research-blueprint.sql (PENDING)
14. supabase/research-plans.sql (PENDING)
15. supabase/research-documents.sql (PENDING)
16. supabase/research-tracker.sql (PENDING)
17. supabase/research-media.sql (PENDING)
18. supabase/research-questions.sql (PENDING)
19. supabase/research-sla-events.sql (PENDING)
20. supabase/research-catalog.sql (PENDING, needs-review, commerce)
21. supabase/research-inventory-lots.sql (PENDING, needs-review, commerce)
22. supabase/research-orders.sql (PENDING, needs-review, after 20 and 21)
23. supabase/research-subscriptions.sql (PENDING, needs-review, after 20)
24. supabase/research-fulfillment.sql (PENDING, needs-review, after 20, 21, 22)
25. supabase/research-partners.sql (PENDING, needs-review)
26. supabase/research-commission-ledger.sql (PENDING, needs-review, after 20, 21, 25)

Note on the commerce group. There is no hard cross-file foreign key between the
commerce migrations (they reference SKUs and order ids by value, not by FK), so
Postgres will not reject an out-of-order apply. The order above still matters
for readability and for matching the code, and MIGRATIONS.md is explicit that
22 and 26 assume the concepts introduced by 20 and 21. Keep the order.
