-- Read-only precheck. This does not authorize or apply the sibling candidate.
with canonical as (
  select
    to_regprocedure('extensions.digest(bytea,text)') is not null as digest_present,
    to_regclass('public.research_partners') is not null as partners_present,
    to_regclass('public.research_partner_lifecycle_events') is not null
      and not exists (
        select 1 from (values ('id'),('partner_id'),('to_state'),('occurred_at')) required(column_name)
        where not exists (
          select 1 from information_schema.columns actual
          where actual.table_schema = 'public'
            and actual.table_name = 'research_partner_lifecycle_events'
            and actual.column_name = required.column_name
        )
      ) as partner_lifecycle_present,
    to_regclass('public.research_commission_ledger') is not null as ledger_present,
    to_regprocedure('public.research_ledger_is_append_only()') is not null as append_function_present,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'research_commission_ledger'
        and column_name = 'kind' and data_type = 'text'
    ) as kind_column_present,
    exists (
      select 1 from pg_trigger t
      where t.tgrelid = to_regclass('public.research_commission_ledger')
        and t.tgname = 'research_commission_ledger_no_update'
        and t.tgenabled = 'O' and not t.tgisinternal
    ) as ledger_append_trigger_present,
    exists (
      select 1 from pg_roles where rolname = 'service_role'
    ) as service_role_present,
    exists (
      select 1
      from pg_catalog.pg_class ledger
      join pg_catalog.pg_roles owner_role on owner_role.oid = ledger.relowner
      where ledger.oid = to_regclass('public.research_commission_ledger')
        and owner_role.rolname = current_user
    ) as ledger_owner_is_executor
), candidate_absent as (
  select not exists (
    select 1 from (values
      ('public.research_commission_program_schedules'),
      ('public.research_partner_commission_program_bindings'),
      ('public.research_partner_commission_program_binding_events'),
      ('public.research_commission_period_ledger'),
      ('public.research_commission_state_events')
    ) expected(name)
    where to_regclass(expected.name) is not null
  ) and not exists (
    select 1 from (values
      ('public.research_program_commission_bind(jsonb)'),
      ('public.research_program_commission_terminate_binding(jsonb)'),
      ('public.research_program_commission_commit(jsonb,integer)'),
      ('public.research_program_commission_transition(jsonb)')
    ) expected(signature)
    where to_regprocedure(expected.signature) is not null
  ) as absent
)
select jsonb_build_object(
  'verdict', case
    when not (
      canonical.digest_present and canonical.partners_present and canonical.partner_lifecycle_present
      and canonical.ledger_present
      and canonical.append_function_present and canonical.kind_column_present
      and canonical.ledger_append_trigger_present and canonical.service_role_present
      and canonical.ledger_owner_is_executor
    ) then 'STOP_MISSING_CANONICAL_AUTHORITY'
    when not candidate_absent.absent then 'STOP_REVIEW_EXISTING_OBJECTS'
    else 'APPLY_READY'
  end,
  'canonicalPartnersPresent', canonical.partners_present,
  'extensionsDigestPresent', canonical.digest_present,
  'canonicalPartnerLifecyclePresent', canonical.partner_lifecycle_present,
  'canonicalCommissionLedgerPresent', canonical.ledger_present,
  'appendOnlyAuthorityPresent', canonical.append_function_present,
  'canonicalKindColumnPresent', canonical.kind_column_present,
  'canonicalLedgerAppendTriggerPresent', canonical.ledger_append_trigger_present,
  'serviceRolePresent', canonical.service_role_present,
  'canonicalLedgerOwnerIsExecutor', canonical.ledger_owner_is_executor,
  'candidateObjectsAbsent', candidate_absent.absent
) as commission_program_precheck
from canonical cross join candidate_absent;
