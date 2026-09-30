# HL-26 deterministic-conflict correction: local disposable qualification

This verifies only the retry-loop correction within the still-open HL-12 financial lane. It is not amount-bound payment qualification, managed staging, or production evidence.

Candidate: `supabase/migrations/20260930191323_research_assisted_order_quote_payment_guard.sql`. The Supabase CLI 2.51.0 created the migration file; the SQL was then authored in that file. Its final checksum and source SHA must be pinned after commit. M71 history was not edited.

## Disposable setup and run

The database image was `postgres:17-alpine`; API image was `public.ecr.aws/supabase/postgrest:v14.13`. Both ran as isolated local Docker containers on a private network with loopback-only API port 31333. The following exact source files were piped to `psql -U postgres -v ON_ERROR_STOP=1`:

1. `supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql`
2. `supabase/migrations/20260815150000_research_assisted_order_bridge.sql`
3. The candidate migration, twice in succession

All four applications exited 0. The first and second candidate applications each produced two `CREATE FUNCTION`, two `REVOKE`, and two `GRANT` results. No managed database was contacted.

The test PostgREST authenticator had only synthetic local credentials and switched to `service_role` solely inside this disposable database. Direct privilege checks showed EXECUTE on both public RPCs false for `anon` and `authenticated`, true for `service_role`.

| PostgREST v14.13 request | HTTP | SQLSTATE/detail | Elapsed |
| --- | ---: | --- | ---: |
| Stale `research_assisted_order_set_status` compare-and-set | 400 at PostgREST, mapped to 409 by application | `P0001` / `ASSISTED_ORDER_STALE_STATUS` | 89 ms |
| Duplicate/non-pending `research_assisted_order_document_complete` | 400 at PostgREST, mapped to 409 by application | `P0001` / `ASSISTED_ORDER_DOCUMENT_NOT_PENDING` | 8 ms |

`pg_stat_database.xact_rollback` remained `0` to `0` over the following two seconds. Neither request hung. The app mapping and owner-authorized repeat-completion precheck have focused unit tests. The first focused run after patching failed seven tests because the precheck was accidentally placed in upload creation; it was moved to completion, and the rerun passed all 52 tests. Preserve the failed run as a failed run, not as a clean first attempt.

The local PostgREST response is HTTP 400; only the mounted application's repository/error mapper returns 409. A fully composed HTTP-to-PostgREST regression is still required. The local containers and private network were stopped and removed. No real email, money, hosted configuration, managed migration, staging or production state changed.
