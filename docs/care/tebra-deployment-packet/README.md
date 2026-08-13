# Tebra link store: execution packet

Everything Samuel needs to apply the Care to Tebra durable link store, prepared and
dry-run so the human step is short. **Nothing here has been applied to production.**

| | |
| --- | --- |
| Lane | TEBRA-A, `lane/care-tebra-connector` |
| Human blocker | an irreversible production migration, which an agent must not apply |
| Dry run | PostgreSQL 17.6 (`public.ecr.aws/supabase/postgres:17.6.1.139`), throwaway container, destroyed after |
| Production mutated | NO |

## Why this is needed

`server/care/tebra-link-store.ts` defines `TebraLinkRowGateway`, the durable port behind
the connector's mappings, cursors and run lease. Only the in-memory implementation
ships. An in-memory lease does not coordinate across processes, so **the poller must not
run on more than one instance until these tables exist.**

The connector is inert regardless: no route is registered and no scheduler is started,
so applying this changes no live behaviour on its own.

## Files

| File | What it is |
| --- | --- |
| `001_care_tebra_link_store.sql` | The migration. Three tables, one function. |
| `002_postcheck_readonly.sql` | Read-only. Writes nothing. Safe against production any time. |
| `003_rollback.sql` | Drops all four objects and returns the schema to its prior shape. |

## Why it is not in `supabase/migrations/`

`supabase db push` applies everything under that directory. An unreviewed candidate
sitting there is armed to reach production on someone else's unrelated push. It stays
here until the release manager registers it in `docs/coordination/MIGRATION_DAG.json`
(leased to that lane) and moves it deliberately. The DAG verifier reads that JSON rather
than scanning the directory, so the current DAG is unaffected and still reports 26 nodes.

## What the dry run proved

Executed against a real PostgreSQL 17 instance, not asserted.

1. **Applies cleanly**, exit 0.
2. **Re-runnable.** A second apply skips all three tables and exits 0.
3. **Postcheck passes**, all 7 rows `ok = true`: tables present, RLS enabled on all
   three, no policies, lease function present, the external-id uniqueness constraint
   present, no grants to `anon`/`authenticated`/`public`, no malformed mappings.
4. **Lease semantics** match the in-memory store exactly across all six cases: acquire
   fresh, refuse a different owner while held, allow the holder to renew, refuse the
   other owner again after renewal, allow the other owner once expired, then refuse the
   original.
5. **Lease atomicity under real concurrency.** With one transaction holding the row, a
   second acquirer for a different owner **blocked for 10.2 seconds** and then correctly
   returned `false`; the final owner was the first caller. Two racing acquirers do not
   both win. This is the invariant a read-then-write in application code would break,
   and it is why the acquire is one statement inside a function.
6. **Constraints refuse bad rows**: a duplicate external id, an external id shaped like
   an email address, and an entity outside `patient`/`appointment` are all rejected.
7. **The postcheck earns its place.** A row that is well-shaped but points at another
   record passes the CHECK constraint and is still caught by `links_wellformed`.
8. **Rollback is clean.** After `003`, zero `care_tebra%` tables and zero `care_tebra%`
   functions remain, and a subsequent re-apply returns all 7 postchecks to green.

One defect was found and fixed by dry-running rather than by review: `pg_class.relkind`
is `"char"`, so `text || relkind` raised `operator is not unique` and the migration
failed on apply. It now casts explicitly.

## Morning procedure

Roughly five minutes.

1. **Preflight, read-only.** Run `002_postcheck_readonly.sql` against production. Before
   the migration every row is expected to report `ok = false` or error on the missing
   relation. That is the expected "not yet applied" state and confirms you are pointed
   at the right database.
2. **Apply** `001_care_tebra_link_store.sql` in one transaction. It is wrapped in
   `begin`/`commit`, so a failure leaves nothing behind.
3. **Postcheck.** Re-run `002`. **Every row must report `ok = true`.** If any row is
   false, stop and run `003_rollback.sql`; nothing else depends on these tables.
4. **Record it.** Register the migration in `docs/coordination/MIGRATION_DAG.json` and
   move the file into `supabase/migrations/`. That is the release manager's lease.

No application deploy is required. The connector does not read these tables until
`TebraLinkRowGateway` is implemented against them and wired, which is separate work.

## What this does NOT unblock

The practice client still cannot be written. That needs the current Tebra technical
guide, the account credentials, and the customer key, and no amount of local preparation
substitutes for them. Applying this migration is safe and useful on its own because it
removes the multi-instance restriction from the poller, but the connector still performs
no upstream call until the client exists.

## Reproducing the dry run

```bash
docker run --rm -d --name tebra-dryrun -e POSTGRES_PASSWORD=dryrun -p 54399:5432 public.ecr.aws/supabase/postgres:17.6.1.139
docker exec -i -e PGPASSWORD=dryrun tebra-dryrun psql -h 127.0.0.1 -U postgres -c "create database tebra_dryrun"
docker exec -i -e PGPASSWORD=dryrun tebra-dryrun psql -h 127.0.0.1 -U postgres -d tebra_dryrun -v ON_ERROR_STOP=1 < 001_care_tebra_link_store.sql
docker exec -i -e PGPASSWORD=dryrun tebra-dryrun psql -h 127.0.0.1 -U postgres -d tebra_dryrun < 002_postcheck_readonly.sql
docker rm -f tebra-dryrun
```
