-- CANDIDATE ONLY. DO NOT AUTO-APPLY. Lead-owned production apply after review.
--
-- QA production probe (2026-08-14, read-only, anon key): every sensitive table
-- in the spot-check set refuses anon with 42501 EXCEPT research_rate_limits,
-- which answers 200 with an empty array. RLS-no-policy filters the rows, so
-- nothing leaks today, but the default anon/authenticated SELECT grants were
-- never revoked, contradicting the file's own "service role only, like every
-- research table" contract and leaving a single shield where the platform
-- model is belt-and-braces (revoke + RLS). Rate-limit keys can embed request
-- identity material and must never be one policy away from readable.
--
-- Zero behavior change: the application reaches the table only through
-- research_rate_limit_hit under the service role.

begin;

revoke all on table public.research_rate_limits from public, anon, authenticated;

do $postcondition$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'research_rate_limits'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception 'rate-limit grant revoke postcondition: anon/authenticated grant survives'
      using errcode = '55000';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'research_rate_limits' and c.relrowsecurity
  ) then
    raise exception 'rate-limit grant revoke postcondition: RLS is not enabled'
      using errcode = '55000';
  end if;
end;
$postcondition$;

commit;
