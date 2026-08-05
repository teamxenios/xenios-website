-- DURABLE SESSION OBJECT VERIFICATION. READ ONLY.
-- No INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, TRUNCATE, GRANT or REVOKE.
--
-- Proves the durable Private Early Access session store's database objects are
-- present in production, and that no existing session or nonce row pins an
-- owner UUID we would have to match.

select * from (
  select 1 as ord, 'sessions table' as check_name,
         case when to_regclass('public.research_private_early_access_sessions') is null
              then 'ABSENT' else 'PRESENT' end as observed,
         'PRESENT' as expected,
         case when to_regclass('public.research_private_early_access_sessions') is null
              then 'FAIL - STOP' else 'PASS' end as verdict

  union all
  select 2, 'nonces table',
         case when to_regclass('public.research_private_early_access_nonces') is null
              then 'ABSENT' else 'PRESENT' end, 'PRESENT',
         case when to_regclass('public.research_private_early_access_nonces') is null
              then 'FAIL - STOP' else 'PASS' end

  union all
  -- The four functions the repository calls. A missing one means unlock cannot
  -- mint a session even once the owner id is set.
  select 3, 'RPC research_private_early_access_issue_nonce',
         count(*)::text, '1',
         case when count(*) >= 1 then 'PASS' else 'FAIL - STOP' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'research_private_early_access_issue_nonce'

  union all
  select 4, 'RPC research_private_early_access_exchange_nonce',
         count(*)::text, '1',
         case when count(*) >= 1 then 'PASS' else 'FAIL - STOP' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'research_private_early_access_exchange_nonce'

  union all
  select 5, 'RPC research_private_early_access_session_active',
         count(*)::text, '1',
         case when count(*) >= 1 then 'PASS' else 'FAIL - STOP' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'research_private_early_access_session_active'

  union all
  select 6, 'RPC research_private_early_access_revoke_session',
         count(*)::text, '1',
         case when count(*) >= 1 then 'PASS' else 'FAIL - STOP' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'research_private_early_access_revoke_session'

  union all
  select 7, 'session indexes',
         count(*)::text, '2',
         case when count(*) = 2 then 'PASS' else 'REVIEW' end
  from pg_class
  where relkind = 'i'
    and relname in ('research_private_early_access_nonces_unconsumed_idx',
                    'research_private_early_access_sessions_owner_active_idx')

  union all
  -- owner_id is `uuid not null` with NO foreign key, so it is a deployment
  -- namespace rather than a reference to a user. These two rows confirm nothing
  -- already claims a different owner.
  select 8, 'existing session rows',
         (select count(*)::text from public.research_private_early_access_sessions), '0',
         case when (select count(*) from public.research_private_early_access_sessions) = 0
              then 'PASS - no owner already pinned' else 'REVIEW - see row 10' end

  union all
  select 9, 'existing nonce rows',
         (select count(*)::text from public.research_private_early_access_nonces), '0',
         case when (select count(*) from public.research_private_early_access_nonces) = 0
              then 'PASS' else 'REVIEW - see row 10' end

  union all
  select 10, 'distinct owner_id values already recorded',
         coalesce((select string_agg(distinct owner_id::text, ', ')
                     from (select owner_id from public.research_private_early_access_sessions
                           union
                           select owner_id from public.research_private_early_access_nonces) o),
                  'none'),
         'none, or the value to reuse',
         'REVIEW'
) checks
order by ord;
