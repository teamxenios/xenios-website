# Research RLS retro hardening rollback

## Release identity

- Task: XCA-W9-RLS-HARDENING (isolated security-hardening lane).
- Branch: `claude/xca-20260729T0302Z/rls-hardening`.
- Exact source base (START_SHA):
  `fc07a9b123806765b383203baf4b534dc3574ed2`.
- Managed migration candidate:
  `supabase/migrations/20260729100000_research_rls_retro_hardening.sql`.
- Verification pair:
  `supabase/verification/research-rls-retro-hardening-disposable-bootstrap.sql`
  plus `supabase/verification/research-rls-retro-hardening.verify.sql`.
- Static invariants: `server/rls-invariants.test.ts` (no database; asserts the
  sole-policy invariant across `supabase/`, forced-RLS coverage for every
  research table a managed migration creates, and that this candidate is
  revoke-and-force only).
- Verified on a disposable local `postgres:16` Docker container (never a
  remote or production database): the bootstrap applied the exact in-tree
  source scripts verbatim (`schema.sql`, membership, members, referrals,
  Track A, founding membership, orders, and `care-access-foundation.sql`)
  under simulated Supabase default privileges, then the verifier passed all
  ten sections, including the idempotency double-apply.

## What the candidate does

The old-generation scripts only ENABLE row level security. They never FORCE
it and they never revoke the Supabase default `anon`/`authenticated` table
grants, so the protection rests entirely on the zero-policy state. The
candidate converges every old-generation table onto the new-generation
posture (Product Control migration `20260726143000` and later): for each of
92 enumerated tables that exists (each guarded by `to_regclass`, so absent
tables no-op with a NOTICE), it enables RLS, forces RLS, and revokes all
table privileges from `PUBLIC`, `anon`, and `authenticated`. It then revokes
the `anon`/`authenticated` entries from the default privileges in schema
`public` for tables, sequences, and functions, so future objects stop
silently inheriting browser grants. It creates no policy, no object, changes
no server-role grant, and reads or writes zero rows.

The enumerated groups: the five `schema.sql` main-site tables; the eight
membership/members/referrals tables; the fifteen Track A member-platform
tables; the nineteen `research_fm_*` founding-membership tables; the
thirty-three PENDING commerce-lane tables (MIGRATIONS.md orders 22 to 26
plus `research_order_shipments`); and twelve additional enable-only tables
confirmed during local verification (notification outbox, consent covenant,
referral fraud, idempotency keys, and the two inventory-lot tables
`research_lot_excursion_events` and `research_lot_shipments` that the later
forced-RLS inventory migrations did not cover).

Deliberately untouched: the two documented Care read surfaces.
`care_role_assignments` and `care_access_audit` keep their intentional
authenticated SELECT grants and their two read policies from
`care-access-foundation.sql`, which remains the only policy source in the
repository.

## Sequencing (release manager)

- Apply anytime after `20260726214500`. The candidate is independent of the
  three migrations owned by other writers (`20260727200000`,
  `20260728010000`, `20260728020000`) and of the sibling-branch Claude
  migration `20260729000000` (pricing lineage). Its timestamp
  `20260729100000` already sorts after all of them; do not renumber it ahead
  of them.
- If the candidate is applied before the PENDING commerce scripts
  (MIGRATIONS.md orders 22 to 26), the commerce tables no-op with a NOTICE.
  Re-run the exact same file after those scripts create their tables; it is
  idempotent in both branches. The default-privileges revocation does not
  substitute for the re-run, because those scripts do not FORCE row level
  security on their tables.
- `supabase/MIGRATIONS.md` is leased to another writer, so this candidate
  adds no ledger row itself. Proposed entry text for whoever integrates the
  ledger (next free order number NN):

  `| NN | migrations/20260729100000_research_rls_retro_hardening.sql | Retroactive FORCE row level security plus browser-role grant revocation for all 92 old-generation tables (to_regclass-guarded, absent tables no-op), and default-privileges revocation so future public-schema objects stop inheriting anon/authenticated grants | PENDING (not run) | — | supabase/verification/research-rls-retro-hardening.verify.sql on a disposable PostgreSQL |`

## Production caveat: the grantor role for default privileges

`ALTER DEFAULT PRIVILEGES` without `FOR ROLE` edits the defaults of the role
executing the statement, and default privileges are stored per grantor. In
Supabase the SQL editor and managed migrations run as the `postgres` role,
which is also the role whose default ACL carries the browser grants, so the
plain form edits exactly the right defaults. If the file is ever applied as
any other role, the `postgres` defaults survive untouched and the
default-privileges section must be re-run as `postgres`. After a production
apply, verify with:

```sql
select pg_get_userbyid(defaclrole) as grantor, defaclobjtype, defaclacl
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
 where n.nspname = 'public';
```

No `anon` or `authenticated` entry should remain in `defaclacl` for tables,
sequences, or functions.

One nuance: PostgreSQL itself grants EXECUTE on new functions to `PUBLIC` by
default, independent of default privileges. The candidate removes the
Supabase-layered `anon`/`authenticated` function defaults; new SECURITY
DEFINER functions still need their own explicit `PUBLIC` revoke, exactly as
the new-generation migrations already do.

## Routine recovery

The candidate is idempotent and touches no data. If application is
interrupted, re-run the exact reviewed file; every table action is
existence-guarded and every statement is a safe re-run. Nothing needs
restoring, because nothing is created or written.

If the application server ever errors after this migration, that would mean
it was using a browser role or owner-level access instead of the service
role, which is itself a defect to fix forward. The service role's grants and
its RLS bypass are untouched by this candidate.

## Rollback: forward repair, not re-granting

The literal inverse exists (un-force each table and re-grant the browser
roles), but re-granting `anon`/`authenticated` on server-only tables is NOT
recommended and should be treated as a security regression, not a rollback:
no application code path uses browser-role table access on these tables, the
pre-candidate grants existed only as unclaimed Supabase defaults, and
restoring them would reopen the exact latent exposure this migration closes.
Frame any problem after application as forward repair: identify the specific
table and access path that broke, and fix that path to go through the
server's service role.

If a reviewed decision nonetheless requires the literal inverse for a
specific table T (never wholesale):

```sql
alter table public.T no force row level security;
-- Only if a documented, reviewed browser access path requires it, which
-- today none does:
-- grant select on table public.T to authenticated;
```

To restore the previous default-privileges behavior (also not recommended):

```sql
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
```

Never drop or alter the two Care read policies or the Care SELECT grants as
part of any action related to this candidate; they are owned by
`care-access-foundation.sql`.

## Adjacent findings NOT addressed here (release-manager boundary)

Observed during this lane's verification and deliberately out of scope for
this candidate, so they are recorded for the release manager:

- `server/routes.ts` line 107: `adminAuth` compares the bearer token with a
  plain string inequality (`authHeader !== \`Bearer ${adminKey}\``), which is
  not constant-time. That file is leased to another writer; a follow-up
  should move the comparison to `crypto.timingSafeEqual` over equal-length
  digests.
- The `public.rls_auto_enable()` SECURITY DEFINER event trigger exists in
  production (its execute grants were hardened by
  `research-security-definer-grants-hardening.sql`, MIGRATIONS.md order 30),
  but its body is not source-controlled in this repository. It should be
  exported, reviewed, and committed.
- `research-product-requests.sql` tables (order 27) had their browser grants
  revoked by order 28 but are still not FORCE row level security. That set is
  outside this candidate's enumerated groups and is a smaller residual gap
  than the ones closed here, because the revocation already landed.
