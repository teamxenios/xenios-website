-- Read-only postcheck. APPLIED_OK does not prove an application deployment or
-- activate any partner; it verifies only the reviewed persistence boundary.
with expected(program_id, schedule_version, schedule_hash) as (values
  ('seth_operating_advisor_2026_09_signed', 1, '57616b61ae3c654f6154aa69896861428859033dd75d5b2224203cd1cfe47b3b'),
  ('xenios_standard_rep_2026_09', 1, '5225b31ee28bcad381b81349b11ecb659c9dce3898f9d26026bb3b32d714cceb')
), schedules as (
  select count(*) = 2 as exact_schedules_present
  from expected e
  join public.research_commission_program_schedules s using (program_id, schedule_version, schedule_hash)
), triggers as (
  select count(*) = 4 as append_only_triggers_present
  from pg_trigger
  where tgname in (
    'research_commission_program_schedules_no_update',
    'research_partner_commission_bindings_no_update',
    'research_commission_period_ledger_no_update',
    'research_commission_state_events_no_update'
  ) and not tgisinternal
), function_boundary as (
  select count(*) = 1 and bool_and(not p.prosecdef) as append_function_is_invoker
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'research_program_commission_append_only'
), boundaries as (
  select bool_and(c.relrowsecurity and c.relforcerowsecurity) as forced_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in (
    'research_commission_program_schedules',
    'research_partner_commission_program_bindings',
    'research_commission_period_ledger',
    'research_commission_state_events'
  )
), activation as (
  select count(*) = 0 as no_partner_activated
  from public.research_partner_commission_program_bindings
)
select jsonb_build_object(
  'verdict', case when schedules.exact_schedules_present
    and triggers.append_only_triggers_present and function_boundary.append_function_is_invoker
    and boundaries.forced_rls
    and activation.no_partner_activated then 'APPLIED_OK' else 'REVIEW_REQUIRED' end,
  'exactSchedulesPresent', schedules.exact_schedules_present,
  'appendOnlyTriggersPresent', triggers.append_only_triggers_present,
  'appendFunctionSecurityInvoker', function_boundary.append_function_is_invoker,
  'forcedRls', boundaries.forced_rls,
  'noPartnerActivated', activation.no_partner_activated
) as commission_program_postcheck
from schedules cross join triggers cross join function_boundary cross join boundaries cross join activation;
