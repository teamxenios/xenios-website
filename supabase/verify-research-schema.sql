-- xenios research schema verification. READ ONLY, changes nothing.
-- Paste into the Supabase SQL Editor and run. Every row should say ok = true.
-- Checks: all 14 research tables exist, row level security is enabled on each,
-- no public policies exist (service role only), and the referral seed program
-- row is present exactly once with the accepted Give $10 / Get $15 values.

with required(table_name) as (
  values
    ('research_applications'),
    ('research_application_events'),
    ('research_notification_outbox'),
    ('research_notification_attempts'),
    ('research_external_exports'),
    ('research_admin_notification_preferences'),
    ('research_members'),
    ('referral_programs'),
    ('referral_identities'),
    ('referral_attributions'),
    ('referral_rewards'),
    ('member_credit_ledger'),
    ('research_consent_events'),
    ('research_covenant_acceptances')
),
tables as (
  select
    r.table_name,
    c.oid is not null as table_exists,
    coalesce(c.relrowsecurity, false) as rls_enabled,
    (select count(*) from pg_policies p
      where p.schemaname = 'public' and p.tablename = r.table_name) as policy_count
  from required r
  left join pg_class c
    on c.relname = r.table_name
   and c.relnamespace = 'public'::regnamespace
   and c.relkind = 'r'
),
seed as (
  select count(*) as seed_rows,
         bool_and(enabled
                  and qualification_event = 'membership_activation'
                  and referrer_reward_value_cents = 1500
                  and referred_reward_value_cents = 1000
                  and hold_days = 14
                  and attribution_days = 30) as seed_values_ok
  from public.referral_programs
  where code = 'member-give10-get15'
)
select
  'table: ' || table_name as check_name,
  table_exists and rls_enabled and policy_count = 0 as ok,
  case
    when not table_exists then 'MISSING TABLE'
    when not rls_enabled then 'RLS NOT ENABLED'
    when policy_count > 0 then policy_count || ' unexpected policies'
    else 'exists, rls on, no public policies'
  end as detail
from tables
union all
select
  'seed: member-give10-get15',
  seed_rows = 1 and coalesce(seed_values_ok, false),
  case
    when seed_rows = 0 then 'SEED ROW MISSING (run research-referrals-seed.sql)'
    when seed_rows > 1 then 'DUPLICATE SEED ROWS'
    when not seed_values_ok then 'SEED VALUES WRONG'
    else 'one row, enabled, 1500/1000 cents, 14 hold, 30 attribution'
  end
from seed
order by 1;
