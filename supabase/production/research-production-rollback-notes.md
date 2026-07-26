# Production migration: RLS resolution and rollback

## The RLS concern, resolved authoritatively

Every research table is created with `enable row level security` and **no policy**.
The go-live directive correctly flagged that "RLS-on with zero policies can make
production routes unusable or unsafe." Here is the resolution.

**This is intentional and correct, because the server never touches these tables
as a client.** The research server uses the Supabase SERVICE ROLE
(`getSupabaseAdmin()` in `server/supabase.ts`), which BYPASSES row level security
entirely. No browser, anon key, or authenticated end-user role ever queries these
tables directly: the SPA has no database credentials, and every data path goes
through the gated, guard-protected server APIs.

So the access model is:

- RLS ENABLED + zero policies = the table is reachable ONLY by the service role
  (server) and by nothing else. A leaked anon/authenticated token cannot read or
  write any research table, because no policy grants those roles anything.
- Adding a public policy would be a SECURITY REGRESSION: it would open a
  service-role-only table to a client role. This is called out in
  `supabase/MIGRATIONS.md` and must not be done.

Tenant isolation therefore lives in the SERVER (every query is scoped by the
authenticated member id from the guard, never from a request body), not in RLS
policies. That server-side isolation is exercised by the member A vs member B
tests across every lane in the test suite.

**Verification:** run `research-production-verification.sql`. The clean result is:
every research table RLS-enabled, zero policies, the append-only ledger triggers
present, and the SLA/Telegram uniqueness indexes present.

If a future requirement introduces direct client access to any research table
(for example a Supabase-Realtime member view), that table needs least-privilege
policies designed for exactly that path. No such path exists today.

## Rollback and recovery

- **Idempotent re-apply is the primary recovery.** Every file is
  `create table if not exists` / `create index if not exists`, so re-running
  `research-full-production.sql` after a partial apply is safe and completes it.
- **No destructive DDL.** There is no `drop table`, `truncate`, or migration-level
  `delete from`, so a failed apply leaves existing data intact. (The only
  `delete from` in the codebase is a rate-limit garbage collector inside an
  already-run function.)
- **Additive and inert.** Every new table is unused by the running server until
  its lane is wired and its feature flag is turned on. An applied-but-unused table
  is safe to leave in place; there is no need to drop it to roll back code.
- **Code rollback is independent of schema.** Reverting the merge on `main` and
  redeploying the prior SHA does not require any schema change, because the server
  reads every new table defensively (a missing table degrades to an empty state).
- **A true schema teardown** (dropping the new tables) is a manual, reviewed
  decision that only follows abandoning a domain. It is never part of a routine
  rollback. If ever needed, drop in reverse dependency order (26 -> 9), and note
  that the commission/store-credit ledgers block UPDATE/DELETE by trigger, so a
  teardown must drop the trigger before the table.

## What this bundle does and does not do

- Applies pending migrations 9-26 (member platform + commerce schema). Migrations
  1-8 are already run in production.
- Does NOT enable any capability. All feature flags stay false. Applying the
  schema makes the tables exist; it does not turn on commerce, billing, or any
  provider.
- Does NOT touch secrets, RLS policies, or existing data.

## Release Train 1: products and diagnostics

`supabase/research-products-diagnostics.sql` is additive and must be applied
only after the canonical catalog and inventory-lot migrations. It extends
`research_lot_quality_documents`; it does not create a second product, lot, or
certificate architecture.

Before applying:

- record the current production main SHA and Render deployment ID;
- record counts for `research_products`, `research_inventory_lots`, and
  `research_lot_quality_documents`;
- confirm the two private bucket ids do not refer to an unrelated workload;
- run the migration twice in disposable PostgreSQL with `ON_ERROR_STOP=1`;
- run the Website 3 section of `research-production-verification.sql`.

Routine rollback is code-first:

1. Keep `RESEARCH_COA_ACCESS_ENABLED` and
   `RESEARCH_BIOMARKER_UPLOAD_ENABLED` unset or not `true`.
2. Revert the focused Train 1 code merge and redeploy the recorded prior SHA.
3. Leave the additive tables, columns, audit history, and private objects in
   place. Older code does not use them.
4. Preserve `research_certificate_access_audit`; it is intentionally
   append-only.
5. Record the incident, failed deployment, correction SHA, and smoke evidence
   in issue #44.

Do not drop the tables, delete audit events, empty buckets, or remove canonical
lot-document columns during a routine rollback. A permanent teardown requires
a separate reviewed migration, a verified backup and object-retention plan,
and explicit authorization. If an uploaded biomarker object fails signature or
metadata verification, the production provider removes only that rejected
object before any report reference is committed.
