-- Read-only precheck. This does not authorize or apply the sibling candidate.
select jsonb_build_object(
  'verdict', case
    when to_regclass('public.research_partners') is null
      or to_regclass('public.research_commission_ledger') is null
      or to_regprocedure('public.research_ledger_is_append_only()') is null
      then 'STOP_MISSING_CANONICAL_AUTHORITY'
    when to_regclass('public.research_commission_program_schedules') is not null
      or to_regclass('public.research_partner_commission_program_bindings') is not null
      or to_regclass('public.research_commission_period_ledger') is not null
      or to_regclass('public.research_commission_state_events') is not null
      then 'STOP_REVIEW_EXISTING_OBJECTS'
    else 'APPLY_READY'
  end,
  'canonicalPartnersPresent', to_regclass('public.research_partners') is not null,
  'canonicalCommissionLedgerPresent', to_regclass('public.research_commission_ledger') is not null,
  'appendOnlyAuthorityPresent', to_regprocedure('public.research_ledger_is_append_only()') is not null,
  'programSchedulesPresent', to_regclass('public.research_commission_program_schedules') is not null,
  'programBindingsPresent', to_regclass('public.research_partner_commission_program_bindings') is not null,
  'periodLedgerPresent', to_regclass('public.research_commission_period_ledger') is not null,
  'stateEventsPresent', to_regclass('public.research_commission_state_events') is not null
) as commission_program_precheck;
