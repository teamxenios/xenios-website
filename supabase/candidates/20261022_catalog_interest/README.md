# Catalog-interest database candidate

Status: source candidate only. It has not been applied to local, staging, or production PostgreSQL.

Qualification order in a disposable PostgreSQL 16/17 environment:

1. Run `001_catalog_interest.precheck.sql` read-only.
2. Apply `001_catalog_interest.sql` in a transaction.
3. Run `001_catalog_interest.postcheck.sql` and require both tables to have RLS enabled and forced, zero policies/direct app-role grants, a security-definer RPC with `search_path=''`, only `service_role` execute, and no unexpected pre-existing catalog jobs.
4. Apply the candidate a second time and repeat the postcheck.
5. Run `001_catalog_interest.rehearsal.sql`; it finishes with `ROLLBACK` and proves fresh submit, exact replay, changed-fingerprint conflict, exactly two jobs, and second-job rollback-zero.
6. Run an external two-session concurrency test for one request ID and require one converged receipt and no duplicate rows.

Current X1 limitation: Docker is installed but its daemon is unavailable, and no `psql` or Supabase CLI is present. The rehearsal is therefore prepared but intentionally not claimed as run.
