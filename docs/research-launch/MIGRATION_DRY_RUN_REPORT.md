# Migration dry-run report (live scratch Postgres)

This upgrades the migration validation from a static scan to an actual apply.
All 26 migrations were applied, in manifest order, to a throwaway PostgreSQL 16
database (Docker `postgres:16`, no Supabase-specific objects required: the schema
uses only `pgcrypto`, `uuid`, `jsonb`, `timestamptz`, has zero policies, and
references no `auth.*` objects or Supabase roles).

## Result

| Check | Result |
| --- | --- |
| Migrations applied (1-26, `ON_ERROR_STOP=1`, fail-fast per file) | 26 / 26 PASS, 0 failures |
| `research_*` tables created | 69 |
| Tables with RLS disabled | 0 (every research table RLS-enabled) |
| Policies on `research_*` tables | 0 (service-role-only posture holds) |
| Append-only triggers on commission + store-credit ledgers | present on both |
| Append-only enforcement, live | UPDATE and DELETE on `research_commission_ledger` both raise `ERROR: ledger ... is append only`; the row survives |
| Idempotent re-apply of the full-production bundle (9-26) | PASS, 0 errors (safe to re-run: the primary recovery path) |

## What this proves

- The full integrated schema (member platform + commerce) applies cleanly from
  scratch and is internally consistent (foreign keys, types, triggers, indexes
  all resolve).
- The safety posture the server relies on is real at the database level, not
  just asserted: RLS on, zero policies, and the money ledgers physically reject
  mutation.
- Re-running the bundle after a partial apply is safe, confirming the documented
  rollback/recovery path.

## What this does not cover

- This is a SCHEMA dry-run. It does not exercise application data flows (those
  are covered by the 1533-test suite against the domain services) and it is not
  a substitute for applying the reviewed SQL to the production Supabase project,
  which remains Samuel's action.
- Row level security is enabled but, by design, only meaningful under the
  Supabase role model; the scratch DB confirms RLS is ON and unpoliced, which is
  the intended service-role-only configuration.

## How to reproduce

```
docker run -d --name xenios_dryrun -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:16
# apply supabase/*.sql in manifest order with: docker exec -i xenios_dryrun psql -U postgres -v ON_ERROR_STOP=1 -q -d postgres < <file>
# verify: research_* table count, relrowsecurity, pg_policies, ledger triggers
docker rm -f xenios_dryrun
```
