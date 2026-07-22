-- ==========================================================================
-- XENIOS RESEARCH - PRODUCTION SCHEMA VERIFICATION (read-only, run any time)
-- ==========================================================================
-- Run AFTER research-full-production.sql. It asserts the safety posture the
-- server relies on: every research table exists, has row level security
-- ENABLED, and carries ZERO public policies (service-role-only access). Any row
-- returned by the CHECK queries is a defect to resolve before enabling any
-- capability.
-- ==========================================================================

-- 1. Every research table has RLS enabled. Rows returned here are FAILURES.
select 'RLS_DISABLED' as check, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname like 'research\_%'
  and c.relrowsecurity = false;

-- 2. No research table has ANY policy. Rows returned here are FAILURES
--    (a policy would expose a service-role-only table to client roles).
select 'UNEXPECTED_POLICY' as check, tablename as table_name, policyname
from pg_policies
where schemaname = 'public'
  and tablename like 'research\_%';

-- 3. Presence roll-up: count of research tables and how many have RLS on.
select
  count(*) as research_tables,
  count(*) filter (where c.relrowsecurity) as rls_enabled,
  count(*) filter (where not c.relrowsecurity) as rls_disabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'research\_%';

-- 4. Load-bearing safety objects exist:
--    the append-only ledger triggers on the commission and store-credit ledgers.
select 'MISSING_LEDGER_TRIGGER' as check, expected
from (values
  ('research_commission_ledger append-only trigger'),
  ('research_store_credit_ledger append-only trigger')
) as t(expected)
where not exists (
  select 1 from pg_trigger tg
  join pg_class c on c.oid = tg.tgrelid
  where c.relname in ('research_commission_ledger', 'research_store_credit_ledger')
    and not tg.tgisinternal
);

-- 5. Key idempotency / uniqueness constraints exist (SLA + Telegram link).
--    A missing unique index here would defeat escalation idempotency or the
--    one-active-link-per-chat rule.
select 'MISSING_UNIQUE_INDEX' as check, expected
from (values
  ('research_sla_events unique (kind, subject_id, phase)'),
  ('research_telegram_links active-chat partial unique index')
) as t(expected)
where not exists (
  select 1 from pg_indexes
  where schemaname = 'public'
    and (indexname like '%sla_events%' or indexname like '%telegram_links_active%')
);

-- Expected clean result: checks 1, 2, 4, 5 return ZERO rows; check 3 shows
-- research_tables = rls_enabled and rls_disabled = 0.
