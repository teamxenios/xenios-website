-- Read-only postcheck. APPLIED_OK does not prove an application deployment or
-- activate any partner; it verifies only the reviewed persistence boundary.
with expected_schedules(
  program_id, schedule_version, schedule_hash, definition, effective_at, authority_class
) as (values
  (
    'seth_operating_advisor_2026_09_signed', 1,
    '549f97385d7e7c4bf78bde1f407798dfb35866da2024a97149476217aabe697c',
    $seth${"schemaVersion":1,"programId":"seth_operating_advisor_2026_09_signed","version":1,"label":"Seth operating advisor signed schedule","effectiveDate":"2026-09-02","currency":"USD","eligibleBasis":"eligible_net_collected_product_channel_revenue","initialTermDays":90,"measurementPeriod":{"anchor":"contract_effective_at","days":30},"ratePolicy":{"kind":"marginal_period","bands":[{"throughCents":5000000,"rateBasisPoints":2500},{"throughCents":null,"rateBasisPoints":3000}]},"postTermTailRatePolicy":{"kind":"flat","rateBasisPoints":2500},"customerAttribution":{"startsAt":"first_eligible_transaction","durationMonths":12,"requiresAcceptedRelationship":true,"requiresActiveManagement":true},"reconciliation":{"cadence":"day_15_and_day_30","statementDays":[15,30],"payWithinBusinessDays":5},"phaseOneGuarantee":{"periodIndex":0,"minimumCents":500000,"treatment":"greater_of_commission_or_nonrecoverable_guarantee"},"exclusions":["refund","chargeback","discount","credit","tax","shipping_pass_through","complimentary_value","fraud_or_duplicate","clinical_professional_fee","patient_referral","medication_or_pharmacy_revenue","laboratory_revenue","prescription_revenue","care_clinical_charge","other_written_exclusion"],"sponsorOverridesEnabled":false,"recruiterOverridesEnabled":false,"downlineOverridesEnabled":false,"compensationForRecruitingEnabled":false,"pricingAuthority":{"serverApprovalRequired":true,"floorsCeilingsAndMarginRulesApply":true},"sourceEvidence":[{"file":"SIGNED_XENIOS_SETH_90_DAY_OPERATING_ADVISOR_AGREEMENT_REVISED (1).pdf","sha256":"09318a530d989ce3b1da2b0c24827b604d4e7958f716d6c9f368149f4382d911","location":"Sections 3.1-3.7; Sections 2.3-2.4; signature page","authority":"signed_agreement"}]}$seth$::jsonb,
    '2026-09-02T00:00:00Z'::timestamptz, 'signed_agreement'
  ),
  (
    'xenios_standard_rep_2026_09', 1,
    '5225b31ee28bcad381b81349b11ecb659c9dce3898f9d26026bb3b32d714cceb',
    $standard${"schemaVersion":1,"programId":"xenios_standard_rep_2026_09","version":1,"label":"Xenios standard representative schedule","effectiveDate":"2026-09-15","currency":"USD","eligibleBasis":"eligible_net_collected_product_channel_revenue","initialTermDays":90,"measurementPeriod":{"anchor":"binding_effective_at","days":14},"ratePolicy":{"kind":"flat","rateBasisPoints":2000},"postTermTailRatePolicy":null,"customerAttribution":{"startsAt":"binding_effective_at","durationMonths":null,"requiresAcceptedRelationship":true,"requiresActiveManagement":false},"reconciliation":{"cadence":"biweekly","statementDays":[],"payWithinBusinessDays":null},"phaseOneGuarantee":null,"exclusions":["refund","chargeback","discount","credit","tax","shipping_pass_through","complimentary_value","fraud_or_duplicate","clinical_professional_fee","patient_referral","medication_or_pharmacy_revenue","laboratory_revenue","prescription_revenue","care_clinical_charge","other_written_exclusion"],"sponsorOverridesEnabled":false,"recruiterOverridesEnabled":false,"downlineOverridesEnabled":false,"compensationForRecruitingEnabled":false,"pricingAuthority":{"serverApprovalRequired":true,"floorsCeilingsAndMarginRulesApply":true},"sourceEvidence":[{"file":"XENIOS_REPRESENTATIVE_20_PERCENT_STRUCTURE_AND_OPPORTUNITY_GUIDE_2026-09-15(1).pdf","sha256":"deaa4aca0d3dcf8d9ead6f7d94e41e5538ada5d41a2eba2e44a679d5087da15c","location":"Core structure; How it works; Guardrails","authority":"program_guide"},{"file":"XENIOS_RESEARCH_MASTER_FINANCIAL_PRODUCT_AFFILIATE_MODEL.xlsx","sha256":"80fb6e6fb63ae3b72f337f443185b86d1c8e58e04b32baffaba1114b8855cf89","location":"README rows 6 and 12; Affiliate Program rows 3-21","authority":"planning_model"}]}$standard$::jsonb,
    '2026-09-15T00:00:00Z'::timestamptz, 'dated_program_guide'
  )
), schedules as (
  select count(*) = 2 and bool_and(
    actual.schedule_hash is not distinct from expected.schedule_hash
    and actual.definition is not distinct from expected.definition
    and actual.effective_at is not distinct from expected.effective_at
    and actual.authority_class is not distinct from expected.authority_class
  ) as exact
  from expected_schedules expected
  left join public.research_commission_program_schedules actual
    using (program_id, schedule_version)
), expected_triggers(table_name, trigger_name, function_schema, function_name) as (values
  ('research_commission_program_schedules','research_commission_program_schedules_no_update','private','research_program_commission_append_only'),
  ('research_partner_commission_program_bindings','research_partner_commission_bindings_no_update','private','research_program_commission_append_only'),
  ('research_partner_commission_program_binding_events','research_partner_commission_binding_events_no_update','private','research_program_commission_append_only'),
  ('research_commission_period_ledger','research_commission_period_ledger_no_update','private','research_program_commission_append_only'),
  ('research_commission_state_events','research_commission_state_events_no_update','private','research_program_commission_append_only'),
  ('research_commission_ledger','research_commission_program_insert_guard','private','research_program_commission_insert_guard'),
  ('research_commission_ledger','research_commission_ledger_no_update','public','research_ledger_is_append_only')
), triggers as (
  select count(*) = 7 and bool_and(
    trigger_row.tgname is not null and trigger_row.tgenabled = 'O'
    and not trigger_row.tgisinternal and function_ns.nspname = expected.function_schema
    and function_row.proname = expected.function_name
  ) as exact
  from expected_triggers expected
  left join pg_class table_row on table_row.relname = expected.table_name
  left join pg_namespace table_ns
    on table_ns.oid = table_row.relnamespace and table_ns.nspname = 'public'
  left join pg_trigger trigger_row
    on trigger_row.tgrelid = table_row.oid and trigger_row.tgname = expected.trigger_name
  left join pg_proc function_row on function_row.oid = trigger_row.tgfoid
  left join pg_namespace function_ns on function_ns.oid = function_row.pronamespace
), rls as (
  select count(*) = 5 and bool_and(c.relrowsecurity and c.relforcerowsecurity) as exact
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in (
    'research_commission_program_schedules',
    'research_partner_commission_program_bindings',
    'research_partner_commission_program_binding_events',
    'research_commission_period_ledger',
    'research_commission_state_events'
  )
), no_policies as (
  select count(*) = 0 as exact from pg_policies where schemaname = 'public' and tablename in (
    'research_commission_program_schedules',
    'research_partner_commission_program_bindings',
    'research_partner_commission_program_binding_events',
    'research_commission_period_ledger',
    'research_commission_state_events'
  )
), service_table_privileges as (
  select bool_and(
    has_table_privilege('service_role', 'public.' || table_name, 'SELECT')
    and not has_table_privilege('service_role', 'public.' || table_name, 'INSERT')
    and not has_table_privilege('service_role', 'public.' || table_name, 'UPDATE')
    and not has_table_privilege('service_role', 'public.' || table_name, 'DELETE')
    and not has_table_privilege('service_role', 'public.' || table_name, 'TRUNCATE')
    and not has_table_privilege('service_role', 'public.' || table_name, 'REFERENCES')
    and not has_table_privilege('service_role', 'public.' || table_name, 'TRIGGER')
  ) as exact
  from (values
    ('research_commission_program_schedules'),
    ('research_partner_commission_program_bindings'),
    ('research_partner_commission_program_binding_events'),
    ('research_commission_period_ledger'),
    ('research_commission_state_events')
  ) names(table_name)
), client_table_privileges as (
  select bool_and(
    not has_table_privilege(role_name, 'public.' || table_name, 'SELECT')
    and not has_table_privilege(role_name, 'public.' || table_name, 'INSERT')
    and not has_table_privilege(role_name, 'public.' || table_name, 'UPDATE')
    and not has_table_privilege(role_name, 'public.' || table_name, 'DELETE')
    and not has_table_privilege(role_name, 'public.' || table_name, 'TRUNCATE')
    and not has_table_privilege(role_name, 'public.' || table_name, 'REFERENCES')
    and not has_table_privilege(role_name, 'public.' || table_name, 'TRIGGER')
  ) as exact
  from (values ('anon'),('authenticated')) roles(role_name)
  cross join (values
    ('research_commission_program_schedules'),
    ('research_partner_commission_program_bindings'),
    ('research_partner_commission_program_binding_events'),
    ('research_commission_period_ledger'),
    ('research_commission_state_events')
  ) names(table_name)
), canonical_ledger_privileges as (
  select
    has_table_privilege('service_role','public.research_commission_ledger','SELECT')
    and has_table_privilege('service_role','public.research_commission_ledger','INSERT')
    and not has_table_privilege('service_role','public.research_commission_ledger','UPDATE')
    and not has_table_privilege('service_role','public.research_commission_ledger','DELETE')
    and not has_table_privilege('service_role','public.research_commission_ledger','TRUNCATE')
    and not has_table_privilege('service_role','public.research_commission_ledger','REFERENCES')
    and not has_table_privilege('service_role','public.research_commission_ledger','TRIGGER')
    and not exists (
      select 1 from (values ('anon'),('authenticated')) roles(role_name)
      cross join (values
        ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')
      ) privileges(privilege_name)
      where has_table_privilege(
        roles.role_name,
        'public.research_commission_ledger',
        privileges.privilege_name
      )
    ) as exact
), public_wrappers as (
  select count(*) = 4 and bool_and(
    not p.prosecdef
    and coalesce(p.proconfig @> array['search_path=""']::text[],false)
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
    and not has_function_privilege('anon', p.oid, 'EXECUTE')
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) as exact
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.oid in (
    to_regprocedure('public.research_program_commission_bind(jsonb)'),
    to_regprocedure('public.research_program_commission_terminate_binding(jsonb)'),
    to_regprocedure('public.research_program_commission_commit(jsonb,integer)'),
    to_regprocedure('public.research_program_commission_transition(jsonb)')
  )
), private_writers as (
  select count(*) = 4 and bool_and(
    p.prosecdef
    and coalesce(p.proconfig @> array['search_path=""']::text[],false)
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
    and not has_function_privilege('anon', p.oid, 'EXECUTE')
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) as exact
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.oid in (
    to_regprocedure('private.research_program_commission_bind(jsonb)'),
    to_regprocedure('private.research_program_commission_terminate_binding(jsonb)'),
    to_regprocedure('private.research_program_commission_commit(jsonb,integer)'),
    to_regprocedure('private.research_program_commission_transition(jsonb)')
  )
), private_helpers as (
  select count(*) = 6 and bool_and(
    not p.prosecdef
    and coalesce(p.proconfig @> array['search_path=""']::text[],false)
    and not has_function_privilege('service_role', p.oid, 'EXECUTE')
    and not has_function_privilege('anon', p.oid, 'EXECUTE')
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) as exact
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.oid in (
    to_regprocedure('private.research_program_commission_append_only()'),
    to_regprocedure('private.research_program_commission_insert_guard()'),
    to_regprocedure('private.research_program_commission_canonical_json(jsonb)'),
    to_regprocedure('private.research_program_commission_total(jsonb,bigint,text)'),
    to_regprocedure('private.research_program_commission_revenue_basis(jsonb,bigint)'),
    to_regprocedure('private.research_program_commission_validate_reversal(jsonb,bigint,bigint,jsonb)')
  )
), schema_privileges as (
  select has_schema_privilege('service_role','private','USAGE')
    and not has_schema_privilege('service_role','private','CREATE')
    and not has_schema_privilege('anon','private','USAGE')
    and not has_schema_privilege('authenticated','private','USAGE') as exact
), writer_ownership as (
  select coalesce((
    select ledger.relowner = writer.proowner
    from pg_catalog.pg_class ledger
    join pg_catalog.pg_proc writer
      on writer.oid = to_regprocedure('private.research_program_commission_commit(jsonb,integer)')
    where ledger.oid = to_regclass('public.research_commission_ledger')
  ), false) as exact
), topology as (
  select
    not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'research_partner_commission_program_bindings'
        and column_name = 'ends_at'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'research_commission_ledger'
        and column_name = 'entry_snapshot' and data_type = 'jsonb'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'research_commission_ledger'
        and column_name = 'operation_fingerprint' and data_type = 'text'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'research_commission_ledger'
        and column_name = 'reversal_allocation_snapshot' and data_type = 'jsonb'
    ) as exact
), activation as (
  select count(*) = 0 as exact
  from public.research_partner_commission_program_bindings
)
select jsonb_build_object(
  'verdict', case when schedules.exact and triggers.exact and rls.exact and no_policies.exact
    and service_table_privileges.exact and client_table_privileges.exact
    and canonical_ledger_privileges.exact and public_wrappers.exact and private_writers.exact
    and private_helpers.exact and schema_privileges.exact and writer_ownership.exact
    and topology.exact and activation.exact then 'APPLIED_OK' else 'REVIEW_REQUIRED' end,
  'exactScheduleDefinitions', schedules.exact,
  'exactEnabledTriggers', triggers.exact,
  'forcedRlsOnAllNewTables', rls.exact,
  'noClientPolicies', no_policies.exact,
  'serviceRoleReadOnlyTablesNoTruncate', service_table_privileges.exact,
  'clientRolesNoTablePrivileges', client_table_privileges.exact,
  'canonicalLedgerInsertOnlyNoTruncate', canonical_ledger_privileges.exact,
  'publicWrappersLeastPrivilege', public_wrappers.exact,
  'privateWritersSecurityDefiner', private_writers.exact,
  'privateHelpersNotCallable', private_helpers.exact,
  'privateSchemaLeastPrivilege', schema_privileges.exact,
  'canonicalLedgerWriterOwnershipAligned', writer_ownership.exact,
  'immutableLifecycleAndSnapshotTopology', topology.exact,
  'noPartnerActivated', activation.exact
) as commission_program_postcheck
from schedules cross join triggers cross join rls cross join no_policies
cross join service_table_privileges cross join client_table_privileges
cross join canonical_ledger_privileges cross join public_wrappers cross join private_writers
cross join private_helpers cross join schema_privileges
cross join writer_ownership cross join topology cross join activation;
