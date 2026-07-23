# Founding membership (FM) migration: live dry-run report

Date: 2026-07-22. Runner: `scripts/fm-dryrun.mjs` (throwaway localhost
postgres:16 Docker container `xenios_fm_dryrun`, created and removed by the
script itself; no real or remote database was touched). The run was executed
twice end to end; both runs finished **41/41 proof points passed, exit 0**,
and `docker ps -a` shows zero leftover containers.

## What was proven

1. The FM bundle (`supabase/production/research-founding-membership.sql`)
   applies cleanly on top of the real prerequisite chain.
2. A second apply of the same bundle succeeds with zero errors (idempotent).
3. All 15 FM tables exist, every one RLS-enabled, zero policies, and all 13
   expected triggers installed.
4. The append-only triggers reject UPDATE and DELETE for real (captured
   errors below) on the ledger, the audit trails, and the version histories.
5. The obligation status check constraint, the canonical-pricing
   amount-per-type check, the one-live-activation partial unique, the
   signed-amounts ledger check, the one-receipt-per-obligation unique, the
   one-period-per-funding-obligation unique, and the published-only
   signature gate all reject bad rows with the expected constraint names.
6. The read-only verification SQL
   (`research-founding-membership-verification.sql`) runs clean: every FAIL
   check returned zero rows.
7. Static proof: the bundle contains no destructive DDL.

## Bundle assembly (verbatim, diff-proven)

The bundle concatenates the four domain files plus the new checklist file,
each VERBATIM. A byte-for-byte comparison of each bundle section against its
source file was run at assembly time:

```
supabase/research-fm-payment-methods.sql: VERBATIM MATCH (bundle section 10605 chars, source 10605 chars)
supabase/research-fm-obligations.sql: VERBATIM MATCH (bundle section 11744 chars, source 11744 chars)
supabase/research-fm-identity.sql: VERBATIM MATCH (bundle section 9524 chars, source 9524 chars)
supabase/research-fm-agreements.sql: VERBATIM MATCH (bundle section 12569 chars, source 12569 chars)
supabase/research-fm-checklist.sql: VERBATIM MATCH (bundle section 2115 chars, source 2115 chars)
ALL SECTIONS VERBATIM
```

Adapter-coverage audit (grep of every `.from(...)` target in
`server/research/membership-activation/production-deps.ts` and its
persistence stores):

- `research_members`: provisioned by base migration
  `supabase/research-members.sql` (already RUN in production); the FM bundle
  does not touch it.
- `research_fm_ledger` and `research_fm_receipts`: provisioned by Domain 2
  (`research-fm-obligations.sql`), column shapes verified one to one against
  `createSupabaseLedger` (entry_id, member_id, obligation_id, entry_type,
  amount_cents, actor_id, recorded_at) and `createSupabaseReceipts` (id,
  receipt_number, obligation_id, member_id, amount_cents, currency,
  method_label, issued_at + the UNIQUE (obligation_id) / error-23505 path).
- `research_fm_bridge_checklist`: the ONE adapter target no prior file
  provisioned; now provisioned by the new `supabase/research-fm-checklist.sql`
  (id text primary key, items jsonb, matching the store's
  `upsert({ id, items }, { onConflict: "id" })`).
- `RESEARCH_EVIDENCE_BUCKET`: a private Storage bucket, dashboard-created,
  documented as a comment in the bundle header (not SQL), as is
  `RESEARCH_IDENTITY_BUCKET`.
- Every other store table (obligations, events, periods, methods, method
  versions, bridge settings, bridge audit, identity cases/reviews/audit,
  document versions/signatures) maps to a Domain 1-4 table by the store's own
  table-name constant.

## Exact production apply order (for Samuel)

All in the Supabase SQL Editor of the production project, in this order.
Steps 1 and 2 are already RUN in production; they are listed for a
from-scratch environment.

1. Base migrations 1-8 (already RUN): `supabase/schema.sql`,
   `research-membership.sql`, `research-notification-outbox.sql`,
   `research-members.sql`, `research-referrals.sql`,
   `research-referrals-seed.sql`, `research-consent-covenant.sql`,
   `research-referral-fraud.sql`.
2. Track A: `supabase/production/research-track-a-private-platform.sql`
   (then its verification).
3. Track B commerce: `supabase/production/research-track-b-commerce.sql`
   (then its verification).
4. **FM: `supabase/production/research-founding-membership.sql`.**
5. **FM verification:
   `supabase/production/research-founding-membership-verification.sql`**
   (every FAIL check must return zero rows; `INFO_ROLLUP` should read
   15 / 15 / 0).
6. Storage dashboard (not SQL): create the private buckets
   `RESEARCH_IDENTITY_BUCKET` and `RESEARCH_EVIDENCE_BUCKET` before ever
   flipping `RESEARCH_FOUNDING_ACTIVATION_ENABLED` on.

Applying the FM schema enables nothing:
`RESEARCH_FOUNDING_ACTIVATION_ENABLED` stays default-false, method rows
start disabled and pending_review, and the bridge starts disabled.

## Verbatim excerpts from the run

### Prerequisite chain, first apply, second apply

```
PASS  prerequisite: supabase/schema.sql
PASS  prerequisite: supabase/research-membership.sql
PASS  prerequisite: supabase/research-notification-outbox.sql
PASS  prerequisite: supabase/research-members.sql
PASS  prerequisite: supabase/research-referrals.sql
PASS  prerequisite: supabase/research-referrals-seed.sql
PASS  prerequisite: supabase/research-consent-covenant.sql
PASS  prerequisite: supabase/research-referral-fraud.sql
PASS  prerequisite: supabase/production/research-track-a-private-platform.sql
PASS  prerequisite: supabase/production/research-track-b-commerce.sql
PASS  FM bundle: first apply
PASS  FM bundle: second apply (idempotent re-run)
```

### Posture: 15 tables, all RLS, zero policies, 13 triggers

```
 fm_tables | rls_enabled | rls_disabled
-----------+-------------+--------------
        15 |          15 |            0

 fm_policies
-------------
           0

                  tgname                   |               relname
-------------------------------------------+-------------------------------------
 research_fm_bridge_audit_no_update        | research_fm_bridge_audit_events
 research_fm_checklist_touch               | research_fm_bridge_checklist
 research_fm_signature_requires_published  | research_fm_document_signatures
 research_fm_signatures_no_delete          | research_fm_document_signatures
 research_fm_signatures_no_update          | research_fm_document_signatures
 research_fm_versions_guard                | research_fm_document_versions
 research_fm_versions_no_delete            | research_fm_document_versions
 research_fm_identity_audit_no_update      | research_fm_identity_audit
 research_fm_ledger_no_rewrite             | research_fm_ledger
 research_fm_membership_periods_no_rewrite | research_fm_membership_periods
 research_fm_obligation_events_no_rewrite  | research_fm_obligation_events
 research_fm_method_versions_no_update     | research_fm_payment_method_versions
 research_fm_receipts_no_rewrite           | research_fm_receipts
(13 rows)
```

### Append-only rejections (captured database errors)

The money ledger:

```
PASS  append-only: UPDATE research_fm_ledger rejected
      ERROR:  table research_fm_ledger is append only. Record a new row instead of UPDATE on row 00000000-0000-0000-0000-00000000fb03.
      CONTEXT:  PL/pgSQL function research_fm_append_only() line 3 at RAISE

PASS  append-only: DELETE research_fm_ledger rejected
      ERROR:  table research_fm_ledger is append only. Record a new row instead of DELETE on row 00000000-0000-0000-0000-00000000fb03.
      CONTEXT:  PL/pgSQL function research_fm_append_only() line 3 at RAISE
```

The audit trails (obligation events, identity audit, bridge audit):

```
PASS  append-only: UPDATE research_fm_obligation_events rejected
      ERROR:  table research_fm_obligation_events is append only. Record a new row instead of UPDATE on row d6e9203a-28bd-4de4-9613-7c52955d2b8b.

PASS  append-only: UPDATE research_fm_identity_audit rejected
      ERROR:  research_fm_identity_audit is append only. Record a new row instead of UPDATE on row 00000000-0000-0000-0000-00000000fb06.

PASS  append-only: DELETE research_fm_bridge_audit_events rejected
      ERROR:  table research_fm_bridge_audit_events is append only. Record a new row instead of DELETE on row 96fee90d-0224-4484-93a9-0bacb263db02.
```

The version histories (method versions; published document versions frozen
and undeletable; signatures append-only):

```
PASS  append-only: UPDATE research_fm_payment_method_versions rejected
      ERROR:  table research_fm_payment_method_versions is append only. Record a new row instead of UPDATE on row 497be051-877e-4bf0-960f-9dacacbf7cbc.

PASS  frozen: UPDATE of a PUBLISHED document version's content rejected
      ERROR:  document version 00000000-0000-0000-0000-00000000fb07 reached publication; its content, hash, semver, category, and publication timestamp are frozen

PASS  permanent: DELETE of a PUBLISHED document version rejected
      ERROR:  document version 00000000-0000-0000-0000-00000000fb07 left draft and is a permanent record; supersede, archive, or withdraw it instead of deleting

PASS  append-only: UPDATE research_fm_document_signatures rejected
      ERROR:  research_fm_document_signatures is append only; UPDATE on signature 00000000-0000-0000-0000-00000000fb09 is refused
```

Periods and receipts are also append-only:

```
PASS  append-only: UPDATE research_fm_membership_periods rejected
      ERROR:  table research_fm_membership_periods is append only. Record a new row instead of UPDATE on row 6bfa63e5-40bc-42a5-98d9-b0283e662f8f.

PASS  append-only: UPDATE research_fm_receipts rejected
      ERROR:  table research_fm_receipts is append only. Record a new row instead of UPDATE on row 6b382158-6371-413c-a100-40f3981d45d6.
```

### The obligation status check constraint

```
PASS  obligations: unknown status rejected by the check constraint
      ERROR:  new row for relation "research_fm_obligations" violates check constraint "research_fm_obligations_status_check"
```

### Canonical pricing at the database (never $25 at activation)

```
PASS  pricing: activation_50 at 2500 cents rejected (never $25 at activation)
      ERROR:  new row for relation "research_fm_obligations" violates check constraint "research_fm_obligations_amount_matches_type"

PASS  pricing: renewal_25 at 5000 cents rejected
      ERROR:  new row for relation "research_fm_obligations" violates check constraint "research_fm_obligations_amount_matches_type"
```

### Uniques the money spine relies on

```
PASS  obligations: second LIVE activation for the same member rejected
      ERROR:  duplicate key value violates unique constraint "research_fm_one_live_activation_per_member"

PASS  ledger: a refund with a POSITIVE amount rejected
      ERROR:  new row for relation "research_fm_ledger" violates check constraint "research_fm_ledger_signed_amounts"

PASS  receipts: second receipt for the same obligation rejected
      ERROR:  duplicate key value violates unique constraint "research_fm_receipts_one_per_obligation"
      DETAIL:  Key (obligation_id)=(00000000-0000-0000-0000-00000000fb01) already exists.

PASS  periods: second period funded by the same obligation rejected
      ERROR:  duplicate key value violates unique constraint "research_fm_periods_one_per_obligation"

PASS  signatures: signing a DRAFT document version rejected
      ERROR:  document version 00000000-0000-0000-0000-00000000fb08 is draft, not published; a draft or unpublished version can never be signed
```

### The checklist store's exact write path

```
PASS  checklist: the server's upsert-by-id path works twice (mutable by design)
        id   | done
      -------+------
       day15 | true
      (1 row)
```

### Verification SQL clean, no destructive DDL

```
PASS  verification SQL runs clean (zero FAIL rows)
      ... every FAIL check returned (0 rows) ...
          check    | fm_tables | rls_enabled | rls_disabled
      -------------+-----------+-------------+--------------
       INFO_ROLLUP |        15 |          15 |            0

PASS  static: no destructive DDL in the bundle
      (only drop-trigger-if-exists + recreate, the idempotent pattern)

removed xenios_fm_dryrun

41/41 proof points passed
```

## Known limits of this dry run

- The container runs vanilla postgres:16, not Supabase: RLS enablement and
  zero-policy posture are proven, but service-role bypass behavior is a
  Supabase-runtime property (identical to how the Track A and Track B dry
  runs were scoped).
- Storage buckets are out of SQL scope by design; they are a dashboard step
  in the apply order above.
- Seed fixtures in the dry run are synthetic (fixed test UUIDs, test names);
  none of them exist in the bundle itself, which creates tables only.
