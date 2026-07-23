# Founding membership (FM) migration: rollback and recovery notes

## Scope

This bundle applies ONLY the founding-membership activation schema
(`research-founding-membership.sql`). It runs AFTER migrations 1-8 (already
RUN in production), AFTER Track A
(`research-track-a-private-platform.sql`, migrations 9-19), and AFTER the
Track B commerce bundle (`research-track-b-commerce.sql`, migrations 20-26
plus additions). Nothing in this bundle touches a commerce, health-program,
or tracker table, and it modifies NO existing table: the membership writer's
target (`research_members`) already carries `status`, `billing_state`, and
`activated_at` from the base migrations.

Tables created (15, all new, all prefixed `research_fm_`):

- Domain 1 (payment methods and the bridge): `research_fm_payment_methods`,
  `research_fm_payment_method_versions`, `research_fm_bridge_settings`,
  `research_fm_bridge_audit_events`.
- Domain 2 (the money spine): `research_fm_obligations`,
  `research_fm_obligation_events`, `research_fm_membership_periods`,
  `research_fm_ledger`, `research_fm_receipts`.
- Domain 3 (identity): `research_fm_identity_cases`,
  `research_fm_identity_reviews`, `research_fm_identity_audit`.
- Domain 4 (agreements): `research_fm_document_versions`,
  `research_fm_document_signatures`.
- Section 5 (operations): `research_fm_bridge_checklist`.

Functions installed (7, all `create or replace`, all FM-namespaced):
`research_fm_history_is_append_only`, `research_fm_append_only`,
`research_fm_identity_audit_is_append_only`, `research_fm_versions_guard`,
`research_fm_versions_no_delete`, `research_fm_signature_requires_published`,
`research_fm_signatures_append_only`, plus `research_fm_checklist_touch`.

Triggers installed (13): append-only enforcement on the method version
history, the bridge audit trail, obligation events, membership periods, the
payment ledger, receipts, the identity audit trail, and document signatures
(update and delete separately); the published-content freeze and the
no-delete guard on document versions; the published-only signature gate; and
the `updated_at` touch on the checklist. UPDATE and DELETE on the append-only
tables raise; corrections are new rows.

## Additive only

The bundle contains NO destructive DDL: no `drop table`, no `truncate`, no
`delete from`, no dropped column. The only `drop` statements are
`drop trigger if exists` immediately followed by `create trigger` (the
standard idempotent trigger pattern used by every prior bundle). A failed or
partial apply therefore leaves all existing data intact, and re-running the
bundle completes it.

## RLS posture (correct as-is)

Every FM table is RLS-enabled with zero policies. The server reaches these
tables only through the Supabase SERVICE ROLE, which bypasses RLS. No
browser, anon, or authenticated client role has database credentials or a
policy, so a leaked client token can read/write nothing. A public policy
would be a REGRESSION. Member scoping lives in the server (every query scoped
by the authenticated member id from the guard, never from a request body).

## Secrecy posture

`receiving_instructions_enc` holds AES-GCM CIPHERTEXT only (keyed from
`PAYMENT_INSTRUCTIONS_ENC_KEY`, which lives in the environment, never in the
database). No plaintext receiving identifier, no SSN, no full license
number, no name, and no birth date has a column to land in; the verification
SQL asserts the absence of plaintext-identifier columns. Raw identity
documents and payment evidence live in PRIVATE storage buckets
(`RESEARCH_IDENTITY_BUCKET`, `RESEARCH_EVIDENCE_BUCKET`), which are created
in the Supabase Storage dashboard, not by SQL, and are reached only through
short-lived signed URLs.

## Inert until flagged on

Applying this schema enables nothing. Every founding-activation surface sits
behind `RESEARCH_FOUNDING_ACTIVATION_ENABLED` (default false, the production
default). With the flag off, no store is resolved and no database call
happens (state 1 of the three-state composition in
`server/research/membership-activation/production-deps.ts`). A payment
method row additionally starts `enabled = false` and
`approval_status = 'pending_review'`, and the bridge starts
`bridge_enabled = false`, so even a flag flip exposes no payable method until
a named approver approves one on the record.

The stores read defensively where the domain allows it: the checklist store
treats a missing table or row as an empty checklist (writes error
truthfully), and every store resolves to an in-memory double whenever
Supabase is not configured. Deploy order between code and schema therefore
carries no hazard in either direction.

## Pricing invariants at the database

`research_fm_obligations_amount_matches_type` binds `activation_50` to
exactly 5000 cents and `renewal_25` to exactly 2500 cents. The $50
activation INCLUDES the first 30 days; each $25 renewal covers the next 30
days; the first renewal date is computed when the activation payment is
verified (one period per funding obligation, enforced by
`research_fm_periods_one_per_obligation`). There is no writable combination
that produces a $25 obligation at activation.

## Rollback

- Idempotent re-apply is the primary recovery: every statement is
  `create table/index if not exists`, `create or replace function`, or the
  drop-and-recreate trigger pair, so re-running after a partial apply
  completes it. Proven live in the dry run
  (`docs/research-launch/FM_MIGRATION_DRY_RUN_REPORT.md`): the bundle applied
  twice in sequence with zero errors.
- Code rollback is independent of schema: turning
  `RESEARCH_FOUNDING_ACTIVATION_ENABLED` off (or reverting the deploy)
  returns every route to the `capability_disabled` denial while the tables
  sit inert. No schema change is needed to stand the feature down.
- Schema rollback, if ever explicitly decided, is a manual, ordered drop of
  the 15 `research_fm_` tables (children before parents:
  `research_fm_document_signatures` before `research_fm_document_versions`;
  `research_fm_payment_method_versions` before `research_fm_payment_methods`;
  `research_fm_obligation_events`, `research_fm_membership_periods`,
  `research_fm_ledger`, and `research_fm_receipts` before
  `research_fm_obligations`) and the 8 `research_fm_` functions. It is NOT
  scripted here on purpose: the ledger, receipts, signatures, and audit
  trails are financial and legal records, and destroying them must never be
  one paste away. If the feature is abandoned before launch, prefer leaving
  the empty tables in place behind the off flag.
- The append-only triggers mean a backfill or correction is a NEW row, never
  an UPDATE. A migration that tries to rewrite ledger, receipt, signature,
  event, or period rows will fail; that is the intended behavior, not a bug
  to work around.

## Verification

After the apply, run `research-founding-membership-verification.sql` in the
SQL Editor. Every check labelled FAIL (`MISSING_TABLE`, `RLS_DISABLED`,
`UNEXPECTED_POLICY`, `MISSING_APPEND_ONLY_TRIGGER`, `MISSING_UNIQUE`,
`MISSING_CHECK`, `MISSING_COLUMN`, `UNEXPECTED_PLAINTEXT_COLUMN`) must
return zero rows; `INFO_ROLLUP` should report 15 FM tables, all
RLS-enabled.
