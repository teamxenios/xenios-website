# Supabase migration ledger

The xenios research schema is applied through the approved Supabase production
path in dependency order. For PENDING rows, `docs/coordination/MIGRATION_DAG.json`
dependencies override numeric append order: row 47 must be applied and verified
before row 42. The Order column records append-only ledger history; it does not
authorize or reorder pending application. This ledger is the source of truth for
what has been run. Every file is idempotent (safe to re-run). Update this table
in the same PR that adds or changes a migration file.

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
| 9 | research-member-billing.sql | Member statuses past_due/cancelled + separate billing_state column | RUN (presence verified) | by 2026-07-25 | production schema check |
| 10 | research-agreements.sql | Append-only versioned agreement acceptances (hashed request metadata) | RUN (presence verified) | by 2026-07-25 | production schema check |
| 11 | research-member-profile.sql | Member profile sections, one row per member and section | RUN (presence verified) | by 2026-07-25 | production schema check |
| 12 | research-assessment.sql | Assessment responses (answers jsonb, deadline and reminder tracking) | RUN (presence verified) | by 2026-07-25 | production schema check |
| 13 | research-blueprint.sql | Blueprints: versioned, state machine, review and supersede pointers | RUN (presence verified) | by 2026-07-25 | production schema check |
| 14 | research-plans.sql | Xenios 30, Xenios 90, and the one-per-month plan change requests | RUN (presence verified) | by 2026-07-25 | production schema check |
| 15 | research-documents.sql | Plan documents: versions, checksums, archive pointers, acknowledgment | RUN (presence verified) | by 2026-07-25 | production schema check |
| 16 | research-tracker.sql | Tracker observations across the six metric domains | RUN (presence verified) | by 2026-07-25 | production schema check |
| 17 | research-media.sql | Private media records, retention elections, access audit log | RUN (presence verified) | by 2026-07-25 | production schema check |
| 18 | research-questions.sql | Member questions and Telegram link tokens (hash only) | RUN (presence verified) | by 2026-07-25 | production schema check |
| 19 | research-sla-events.sql | SLA escalation ledger; the unique key is the idempotency guarantee | RUN (presence verified) | by 2026-07-25 | production schema check |
| 20 | research-catalog.sql | Products, provenanced supplier facts, goal + guide links, prohibited claims, open supplier questions, supplement candidates | RUN | 2026-07-25 | managed migration `release_train_1_research_catalog`; production schema/RLS/count verification |
| 21 | research-inventory-lots.sql | Lots, per-lot quality documents, excursions, FEFO allocations, lot-to-order shipment traceability | RUN | 2026-07-25 | managed migration `release_train_1_research_inventory_lots`; production schema/RLS/count verification |
| 22 | research-orders.sql | Carts, orders, order lines, state events, webhook replay events, claims, durable refund keys | PENDING (not run) | — | commerce lane |
| 23 | research-subscriptions.sql | Product subscriptions (30/60/90) + append-only subscription events | PENDING (not run) | — | commerce lane |
| 24 | research-fulfillment.sql | Split fulfillment orders, shipments, shipping quotes with provenance, shipping profiles | PENDING (not run) | — | commerce lane |
| 25 | research-partners.sql | Partners, agreements, training, lifecycle, links, attribution, conversions, organizations, events, content assets, violations | PENDING (not run) | — | commerce lane |
| 26 | research-commission-ledger.sql | Append-only commission + store-credit ledgers (UPDATE/DELETE blocked by trigger), payout batches and attempts | PENDING (not run) | — | commerce lane |
| 27 | research-product-requests.sql | Private member product requests, demand candidates, private attachments, append-only events, and atomic request/status functions | RUN | 2026-07-25 | Supabase migration + production schema checks |
| 28 | research-product-requests-hardening.sql | Remove Supabase default direct table grants from anonymous and authenticated browser roles | RUN | 2026-07-25 | zero browser-role table grants |
| 29 | research-product-requests-function-hardening.sql | Remove default browser-role execution from the append-only event trigger helper | RUN | 2026-07-25 | zero browser-role Product Request function grants |
| 30 | research-security-definer-grants-hardening.sql | Remove unnecessary PUBLIC/anon/authenticated execution from the internal RLS event-trigger helper | RUN | 2026-07-25 | managed migration `20260725231517`; advisor + explicit privilege check |
| 31 | research-products-diagnostics.sql | Extend canonical lots/quality documents; persist supplement placeholders, metabolic pathways/interests, Superpower configuration, biomarker uploads/records, product content, private buckets, and append-only certificate access audit | RUN | 2026-07-25 | managed migration `release_train_1_research_products_diagnostics`; forced-RLS/browser-grant/private-bucket/RPC/count verification |
| 32 | research-prelaunch-foundation.sql | Canonical private roles, seed-origin namespaces, provider modes, access audit, and external-action capture | RUN | 2026-07-25 | managed migration `canonical_prelaunch_foundation`; 5/5 forced RLS, zero browser grants, zero roles/namespaces/audits/captures |
| 33 | research-required-input-readiness.sql | Canonical required-input register, append-only review audit, readiness manifests, and server launch switches | RUN | 2026-07-26 | managed migration `20260726045307 canonical_required_input_readiness`; forced-RLS/browser-grant/zero-row verification |
| 34 | care-access-foundation.sql | Disabled-by-default Care capability, Care-only roles, and metadata-only access audit | RUN | 2026-07-26 | managed migration `20260726064113 care_access_foundation`; one disabled capability, 3/3 forced RLS, zero browser mutation grants, zero role/audit rows |
| 35 | care-eligibility-intake.sql | Care location, eligibility, consent, privacy, waitlist, and versioned intake foundation | RUN | 2026-07-26 | managed migration `20260726080248 care_eligibility_intake`; 13/13 PR2 tables forced RLS, zero browser grants/rows, Care disabled |
| 36 | care-appointments-clinician.sql | Provider-neutral appointments, exact clinician readiness, reminders, check-in, and human review | RUN | 2026-07-26 | managed migration `20260726093600 care_appointments_clinician`; 12/12 PR3 tables forced RLS, zero browser grants/rows, Care disabled |
| 37 | care-prescription-pharmacy.sql | Human-clinician prescription and verified pharmacy/order lifecycle foundation | RUN | 2026-07-26 | managed migration `20260726112848 care_prescription_pharmacy`; 10/10 PR4 tables forced RLS, zero browser grants/rows, Care disabled |
| 38 | migrations/20260726143000_research_product_control_center.sql | Product, variant, effective-dated price, private media, immutable audit, and exact readiness administration | RUN | 2026-07-26 | managed migration `20260726214102 research_product_control_center`; post-apply verification found Supabase pre-existing/default `TRUNCATE`, `REFERENCES`, and `TRIGGER` grants requiring migration 39 before application deployment |
| 39 | migrations/20260726214500_research_product_control_center_privilege_hardening.sql | Converge Product Control service-role grants to the reviewed exact 33-privilege boundary | RUN | 2026-07-26 | managed migration `20260726215603 research_product_control_center_privilege_hardening`; 33 service table privileges, five command tables SELECT-only, zero command DML, zero excess `TRUNCATE`/`REFERENCES`/`TRIGGER`, 11 service RPC grants, zero Product Control rows |
| 40 | migrations/20260727120000_research_inventory_lot_coa_admin.sql | Versioned inventory lots, append-only movements, exact-lot private COAs, immutable quality/access audit, and atomic Product Control projection | RUN | 2026-07-27 | managed migration `20260727120000 research_inventory_lot_coa_admin`; Website 6 post-deploy accepted exact production schema/RLS/grants/bucket/zero-row and browser/API gates |
| 41 | migrations/20260727160000_research_inventory_reservation_commands.sql | Atomic server-only inventory reserve/release/finalize/expire commands, independently additive canonical reservation tables, exact readiness serialization, immutable redacted receipts, and checkout-disabled composition port | RUN | 2026-07-27 | authenticated managed migration `20260727160000 research_inventory_reservation_commands`; repository source identity is SHA-256 `4e30807c7f58abc2d819abf509914364b55cba029586b3492329bacb7eef6005`; provider SQL-byte equality is not claimed |
| 42 | migrations/20260727200000_research_persistent_cart.sql | Authenticated-member and opaque-anonymous persistent-cart commands with exact Product Control price/readiness/inventory lineage, optimistic versions, expiry, idempotency, one-way claim, immutable audit, and no inventory mutation | PENDING (not run) | — | raw Git-blob SHA-256 `6d1379db45939bdb27f6ea1b32c50e3137a3d0c3cbdbe21cd9a145e2d771d880`; accepted disposable PostgreSQL 16 apply-twice/security/concurrency/rollback proof; requires migration 41 |
| 43 | migrations/20260728010000_research_fulfillment_supplier_operations.sql | Supplier and fulfillment operations, immutable command evidence, lot/readiness binding, shipment and exception foundations | PENDING (not run) | — | raw Git-blob SHA-256 `dd8895522862383f2dcc3b2d4013a2a9d4a4ef5385efcf237980756c13b6df53`; accepted PR106 disposable PostgreSQL 16 proof; requires migration 42 |
| 44 | migrations/20260728020000_research_affiliate_professional_operations.sql | Affiliate, organization, professional, commission, statement, payout, reversal, and immutable paid-evidence foundations | PENDING (not run) | — | raw Git-blob SHA-256 `989cc6e5929d1297056c3f600898c07bab191c378107f12c8029263c9c77a722`; accepted PR106 disposable PostgreSQL 16 proof; requires migration 43; commission/payout activation remains separately blocked |
| 45 | migrations/20260729000000_research_pricing_lineage.sql | Additive order-line price provenance snapshot with coherent price identity/version/audience/amount/currency/effective-window evidence and guarded absent-table behavior | PENDING (not run) | — | raw Git-blob SHA-256 `377fe1eec2655026de94454254602a77227adfc0afa4297b8f11711dfe164666`; requires migration 44 and exact target-table preflight |
| 46 | migrations/20260729100000_research_rls_retro_hardening.sql | Retrospective forced-RLS and browser-grant hardening across the intended Research operational schemas with absent-target-safe behavior | PENDING (not run) | — | raw Git-blob SHA-256 `406c9a481dd588c56ec1cff467e091a2e154e92671e3cba30bac3b458013e87d`; requires migration 45 and exact target/privilege preflight |
| 47 | migrations/20260801120000_research_variant_strength_write_gate.sql | Freeze disputed variant identity and refuse unresolved disputed price creation or approval at the database boundary | PENDING (not run) | — | canonical Git-blob SHA-256 `6cd11e07eb764d0f803db4baa308ae397c23aacb8ff5d29306c8797be60b4818`; independently accepted source `0b835c7d7fa6fb633b269cd64665a0338c7bf163`; stock PostgreSQL 16.14 and 17.10 apply/apply-twice, atomic unsafe-precondition rollback, P0/P1/P2/P3-P8/P12/P13, and full/partial/absent rollback plus reapply; requires migrations 38 and 39; prerequisite to migration 42 |

Founding-membership operational migrations use a separate dependency chain.
Production presence and managed migration history were reconciled on
2026-07-25:

| Order | File / managed migration | Status | Production evidence |
|---|---|---|---|
| FM-1 | production/research-founding-membership.sql | RUN (presence verified; exact apply date not recorded) | 18 expected `research_fm_*` tables present with RLS |
| FM-2 | research-fm-esign-native.sql | RUN 2026-07-24 | managed migration `20260724163934` |
| FM-3 | research-fm-esign-native-hardening.sql | RUN 2026-07-24 | managed migration `20260724170132` |
| FM-4 | research-fm-esign-native-attempt-lease.sql | RUN 2026-07-24 | managed migration `20260724171056` |
| FM-5 | research-idempotency-keys.sql | RUN 2026-07-24 | managed migration `20260724185842` |
| FM-6 | research-fm-activation-verify-atomic.sql | RUN 2026-07-24 | managed migration `20260724185858` |
| FM-7 | research-agreement-package-notifications.sql | RUN 2026-07-25 | managed migration `20260725225920`; RLS/grants/triggers verified |

FM-2 through FM-4 require FM-1. FM-6 requires FM-5. Applying schema does
not enable the founding-activation or e-signature capabilities.

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
- 2026-07-25 release discovery reconciled migrations 9-19 against production.
  The `billing_state` column and widened member status constraint are present;
  every expected member-platform table is present; every Research table has
  RLS enabled; and Research has zero policies. The original application date
  was not recorded in the managed migration-history stream, so this ledger
  uses the conservative date `by 2026-07-25` rather than inventing an exact
  run date. The server still reads these objects defensively. Each member-
  platform migration corresponds to a wave documented in
  docs/agent-coordination/status/WEBSITE2_MEMBER_PLATFORM.md.
  Note for whoever runs them: research-sla-events.sql relies on its unique
  (kind, subject_id, phase) constraint for escalation idempotency, and
  research-questions.sql relies on a partial unique index to keep one active
  Telegram link per chat, so neither should be edited to relax a constraint.
- 2026-07-21: migrations 20-26 drafted by the commerce and distribution lane
  (PR #31; renumbered from 10-16 on integration to sit after the member-platform
  migrations). NONE are run. They follow the service-role-only rule: RLS enabled,
  zero policies. Run them in listed order, because 22 and 26 reference concepts
  introduced by 20 and 21. Nothing in the running server queries these tables
  yet, so there is no deploy-order hazard; the commerce services are exercised
  entirely through injected in-memory repositories today.
- Constraints worth knowing before running 20-26, because they will reject data
  that older habits would have allowed:
  - research_product_facts refuses a fact marked `confirmed` without both a value
    and a supplier document or COA source. This is deliberate and is exactly the
    control that keeps the signed-but-unattached supplier package (eligibility
    summary relocated to the private operations repository; see
    docs/research-commerce/SUPPLIER_DATA_RELOCATION.md) from unlocking commerce
    on COA-backed facts.
  - research_orders refuses a payment_authorized, payment_captured, or refunded
    row without a provider reference, refuses a capture above the authorization,
    and refuses a refund above the capture.
  - research_commission_ledger and research_store_credit_ledger BLOCK UPDATE and
    DELETE via trigger. A correction must be a new row referencing the original.
    A migration that tries to backfill by UPDATE on these tables will fail, which
    is the intended behavior rather than a bug to work around.
  - research_partners has no parent, sponsor, upline, or tier column, and must
    not gain one. Recursive downline compensation is a founder-level prohibition.
- 2026-07-25: FM-7 was applied for the communications/client-experience
  release. Migration 30 was applied after an idempotent disposable PostgreSQL
  dry run. Production verification confirmed that `public.rls_auto_enable()`
  retains its pinned `pg_catalog` search path and enabled event trigger while
  PUBLIC, `anon`, and `authenticated` no longer have execute privilege. The
  corresponding Supabase security-advisor finding is cleared.

Care uses a separate, disabled-by-default migration chain. These migrations
must remain serialized behind Website 2 review and must not activate clinical
services:

| Order | File | Purpose | Status |
|---|---|---|---|
| Care-1 | `care-access-foundation.sql` | Care capability, roles, access audit, forced RLS | RUN (`20260726064113 care_access_foundation`) |
| Care-2 | `care-eligibility-intake.sql` | Patient identity seam, location, state/clinician coverage, append-only consent/waitlist/eligibility history, and versioned intake foundation | RUN (`20260726080248 care_eligibility_intake`) |
| Care-3 | `care-appointments-clinician.sql` | Verified medical-group/clinician/provider readiness, appointment/reminder lifecycle, private telehealth references, assignment history, and human-clinician review | RUN (`20260726093600 care_appointments_clinician`) |
| Care-4 | `care-prescription-pharmacy.sql` | Patient-specific human-clinician prescription source/signing/supersession plus verified pharmacy, license, state coverage, operator, clarification, dispense, and shipment foundations | RUN (`20260726112848 care_prescription_pharmacy`) |

Care-2, Care-3, and Care-4 seed no state, clinician, medical group, provider,
consent document, intake definition, medical question, patient, appointment,
pharmacy, product, price, prescription, instruction, shipment, or availability
record. No migration can make the canonical Care capability live. Care-3 must
be applied only after Care-1 and Care-2; Care-4 must be applied only after
Care-3. Website 2 must integrate the canonical pre-launch gate and required
input model before any private seed-data workflow is authorized.
- 2026-07-26: Care PR2 was applied as managed migration
  `20260726080248 care_eligibility_intake` after Care PR1. Production
  verification found all 13 PR2 tables forced RLS, zero browser table or
  routine grants, exactly three service-role RPC grants, zero PR2 rows, and the
  canonical Care capability still disabled.
- The global order in this ledger is the integration order. The authoritative
  ordered run script for a production apply is
  docs/research-launch/FULL_PRODUCTION_MIGRATION_MANIFEST.md.
- 2026-07-25: Release Train 1 production migrations were applied in dependency
  order as managed migrations
  `release_train_1_research_catalog`,
  `release_train_1_research_inventory_lots`, and
  `release_train_1_research_products_diagnostics`. Verification found all
  expected tables, the Website 3 forced-RLS/browser-grant/private-bucket/RPC
  posture, zero fabricated product/lot/COA/biomarker records, and unchanged
  existing record-count invariants.
- `research-prelaunch-foundation.sql` was applied as managed migration
  `canonical_prelaunch_foundation`. Production verification found the canonical
  disabled settings row, 5/5 forced-RLS tables, zero browser grants, and zero
  roles, namespaces, access audits, or external-action captures.
- `research-required-input-readiness.sql` was applied as managed migration
  `20260726045307 canonical_required_input_readiness`. Production verification
  found 4/4 forced-RLS governance tables, zero browser grants, and zero
  required-input, audit, readiness-manifest, or launch-switch rows.
- `care-access-foundation.sql` was applied as managed migration
  `20260726064113 care_access_foundation` after the Website 2 integration
  candidate passed independent review. Production verification found one
  canonical `care:disabled` capability, 3/3 forced-RLS tables, zero browser
  mutation grants, two intended authenticated read policies, and zero Care
  role-assignment or access-audit rows. It creates no clinical record.

- 2026-07-30 authenticated production preflight confirmed managed migration
  `20260727160000 research_inventory_reservation_commands` is applied.
  The five managed files numbered 42 through 46 are present in the repository,
  are represented exactly once in `docs/coordination/MIGRATION_DAG.json`, and
  remain absent from the authenticated production ledger. Their checked-in
  representation is release-order evidence only; it does not authorize or
  imply production application.
  Pre-apply production verification found all four cart tables and all cart
  functions absent, all Product Control, inventory, and reservation domain rows
  at zero, and two existing Research members. The migration creates no rows and
  performs no inventory reservation, allocation, decrement, checkout, order,
  payment, provider, or Care action. Applying it to production remains a
  separate protected action that this change does not perform or authorize.
