-- Xenios Research program-specific commission authority and durable ledger seam.
-- CANDIDATE ONLY; NOT APPLIED. Founder approval, migration-DAG registration,
-- exact-SHA deployment authority, precheck, postcheck, rollback rehearsal, and
-- production smoke evidence are required before any production write.
--
-- This extends the canonical research_partners and research_commission_ledger
-- authorities. No partner binding is seeded, so applying the candidate alone
-- activates no partner and accrues no commission.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $commission_program_preflight$
begin
  if to_regclass('public.research_partners') is null
     or to_regclass('public.research_partner_lifecycle_events') is null
     or to_regclass('public.research_commission_ledger') is null then
    raise exception 'program commissions require canonical partner lifecycle and commission authorities'
      using errcode = '55000';
  end if;
  if to_regprocedure('public.research_ledger_is_append_only()') is null then
    raise exception 'program commissions require the canonical append-only ledger trigger function'
      using errcode = '55000';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'research_commission_ledger'
      and column_name = 'kind'
  ) then
    raise exception 'program commissions require the canonical commission kind fidelity column'
      using errcode = '55000';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_class ledger
    join pg_catalog.pg_roles owner_role on owner_role.oid = ledger.relowner
    where ledger.oid = 'public.research_commission_ledger'::regclass
      and owner_role.rolname = current_user
  ) then
    raise exception 'candidate must be applied by the canonical commission ledger owner'
      using errcode = '55000';
  end if;
end;
$commission_program_preflight$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table if not exists public.research_commission_program_schedules (
  program_id text not null,
  schedule_version integer not null check (schedule_version > 0),
  schedule_hash text not null check (schedule_hash ~ '^[0-9a-f]{64}$'),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  effective_at timestamptz not null,
  authority_class text not null
    check (authority_class in ('signed_agreement','dated_program_guide')),
  recorded_at timestamptz not null default now(),
  primary key (program_id, schedule_version),
  unique (program_id, schedule_version, schedule_hash),
  constraint research_commission_schedule_identity_matches_definition check (
    coalesce(definition->>'programId' = program_id, false)
    and coalesce((definition->>'version')::integer = schedule_version, false)
    and coalesce(
      (definition->>'effectiveDate')::date = (effective_at at time zone 'UTC')::date,
      false
    )
  ),
  constraint research_commission_schedule_forbids_overrides check (
    coalesce((definition->>'sponsorOverridesEnabled')::boolean, true) = false
    and coalesce((definition->>'recruiterOverridesEnabled')::boolean, true) = false
    and coalesce((definition->>'downlineOverridesEnabled')::boolean, true) = false
    and coalesce((definition->>'compensationForRecruitingEnabled')::boolean, true) = false
  )
);

create temporary table commission_expected_program_schedules (
  program_id text not null,
  schedule_version integer not null,
  schedule_hash text not null,
  definition jsonb not null,
  effective_at timestamptz not null,
  authority_class text not null
) on commit drop;

insert into pg_temp.commission_expected_program_schedules(
  program_id, schedule_version, schedule_hash, definition, effective_at, authority_class
) values
(
  'seth_operating_advisor_2026_09_signed', 1,
  '549f97385d7e7c4bf78bde1f407798dfb35866da2024a97149476217aabe697c',
  $seth${"schemaVersion":1,"programId":"seth_operating_advisor_2026_09_signed","version":1,"label":"Seth operating advisor signed schedule","effectiveDate":"2026-09-02","currency":"USD","eligibleBasis":"eligible_net_collected_product_channel_revenue","initialTermDays":90,"measurementPeriod":{"anchor":"contract_effective_at","days":30},"ratePolicy":{"kind":"marginal_period","bands":[{"throughCents":5000000,"rateBasisPoints":2500},{"throughCents":null,"rateBasisPoints":3000}]},"postTermTailRatePolicy":{"kind":"flat","rateBasisPoints":2500},"customerAttribution":{"startsAt":"first_eligible_transaction","durationMonths":12,"requiresAcceptedRelationship":true,"requiresActiveManagement":true},"reconciliation":{"cadence":"day_15_and_day_30","statementDays":[15,30],"payWithinBusinessDays":5},"phaseOneGuarantee":{"periodIndex":0,"minimumCents":500000,"treatment":"greater_of_commission_or_nonrecoverable_guarantee"},"exclusions":["refund","chargeback","discount","credit","tax","shipping_pass_through","complimentary_value","fraud_or_duplicate","clinical_professional_fee","patient_referral","medication_or_pharmacy_revenue","laboratory_revenue","prescription_revenue","care_clinical_charge","other_written_exclusion"],"sponsorOverridesEnabled":false,"recruiterOverridesEnabled":false,"downlineOverridesEnabled":false,"compensationForRecruitingEnabled":false,"pricingAuthority":{"serverApprovalRequired":true,"floorsCeilingsAndMarginRulesApply":true},"sourceEvidence":[{"file":"SIGNED_XENIOS_SETH_90_DAY_OPERATING_ADVISOR_AGREEMENT_REVISED (1).pdf","sha256":"09318a530d989ce3b1da2b0c24827b604d4e7958f716d6c9f368149f4382d911","location":"Sections 3.1-3.7; Sections 2.3-2.4; signature page","authority":"signed_agreement"}]}$seth$::jsonb,
  '2026-09-02T00:00:00Z', 'signed_agreement'
),
(
  'xenios_standard_rep_2026_09', 1,
  '5225b31ee28bcad381b81349b11ecb659c9dce3898f9d26026bb3b32d714cceb',
  $standard${"schemaVersion":1,"programId":"xenios_standard_rep_2026_09","version":1,"label":"Xenios standard representative schedule","effectiveDate":"2026-09-15","currency":"USD","eligibleBasis":"eligible_net_collected_product_channel_revenue","initialTermDays":90,"measurementPeriod":{"anchor":"binding_effective_at","days":14},"ratePolicy":{"kind":"flat","rateBasisPoints":2000},"postTermTailRatePolicy":null,"customerAttribution":{"startsAt":"binding_effective_at","durationMonths":null,"requiresAcceptedRelationship":true,"requiresActiveManagement":false},"reconciliation":{"cadence":"biweekly","statementDays":[],"payWithinBusinessDays":null},"phaseOneGuarantee":null,"exclusions":["refund","chargeback","discount","credit","tax","shipping_pass_through","complimentary_value","fraud_or_duplicate","clinical_professional_fee","patient_referral","medication_or_pharmacy_revenue","laboratory_revenue","prescription_revenue","care_clinical_charge","other_written_exclusion"],"sponsorOverridesEnabled":false,"recruiterOverridesEnabled":false,"downlineOverridesEnabled":false,"compensationForRecruitingEnabled":false,"pricingAuthority":{"serverApprovalRequired":true,"floorsCeilingsAndMarginRulesApply":true},"sourceEvidence":[{"file":"XENIOS_REPRESENTATIVE_20_PERCENT_STRUCTURE_AND_OPPORTUNITY_GUIDE_2026-09-15(1).pdf","sha256":"deaa4aca0d3dcf8d9ead6f7d94e41e5538ada5d41a2eba2e44a679d5087da15c","location":"Core structure; How it works; Guardrails","authority":"program_guide"},{"file":"XENIOS_RESEARCH_MASTER_FINANCIAL_PRODUCT_AFFILIATE_MODEL.xlsx","sha256":"80fb6e6fb63ae3b72f337f443185b86d1c8e58e04b32baffaba1114b8855cf89","location":"README rows 6 and 12; Affiliate Program rows 3-21","authority":"planning_model"}]}$standard$::jsonb,
  '2026-09-15T00:00:00Z', 'dated_program_guide'
);

insert into public.research_commission_program_schedules(
  program_id, schedule_version, schedule_hash, definition, effective_at, authority_class
)
select program_id, schedule_version, schedule_hash, definition, effective_at, authority_class
from pg_temp.commission_expected_program_schedules
on conflict (program_id, schedule_version) do nothing;

do $commission_program_seed_guard$
begin
  if exists (
    select 1
    from pg_temp.commission_expected_program_schedules expected
    left join public.research_commission_program_schedules actual
      using (program_id, schedule_version)
    where actual.program_id is null
       or actual.schedule_hash is distinct from expected.schedule_hash
       or actual.definition is distinct from expected.definition
       or actual.effective_at is distinct from expected.effective_at
       or actual.authority_class is distinct from expected.authority_class
  ) or (
    select count(*) from public.research_commission_program_schedules
    where (program_id, schedule_version) in (
      ('seth_operating_advisor_2026_09_signed', 1),
      ('xenios_standard_rep_2026_09', 1)
    )
  ) <> 2 then
    raise exception 'existing schedule row differs from the exact reviewed v1 definition or hash'
      using errcode = '55000';
  end if;
end;
$commission_program_seed_guard$;

create table if not exists public.research_partner_commission_program_bindings (
  id uuid primary key,
  partner_id uuid not null references public.research_partners(id) on delete restrict,
  program_id text not null,
  schedule_version integer not null,
  schedule_hash text not null,
  effective_at timestamptz not null,
  authority_reference text not null check (length(btrim(authority_reference)) >= 3),
  recorded_at timestamptz not null,
  recorded_by text not null check (length(btrim(recorded_by)) >= 3),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) >= 3),
  operation_fingerprint text not null check (operation_fingerprint ~ '^[0-9a-f]{64}$'),
  foreign key (program_id, schedule_version, schedule_hash)
    references public.research_commission_program_schedules(
      program_id, schedule_version, schedule_hash
    ) on delete restrict
);
create index if not exists research_partner_commission_bindings_resolution_idx
  on public.research_partner_commission_program_bindings(partner_id, effective_at);

create table if not exists public.research_partner_commission_program_binding_events (
  id uuid primary key,
  binding_id uuid not null
    references public.research_partner_commission_program_bindings(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  event_kind text not null check (event_kind = 'terminated'),
  effective_at timestamptz not null,
  authority_reference text not null check (length(btrim(authority_reference)) >= 3),
  recorded_at timestamptz not null,
  recorded_by text not null check (length(btrim(recorded_by)) >= 3),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) >= 3),
  operation_fingerprint text not null check (operation_fingerprint ~ '^[0-9a-f]{64}$'),
  unique (binding_id, sequence)
);
create unique index if not exists research_partner_commission_one_termination_idx
  on public.research_partner_commission_program_binding_events(binding_id)
  where event_kind = 'terminated';

alter table public.research_commission_ledger
  add column if not exists program_id text,
  add column if not exists schedule_version integer,
  add column if not exists schedule_hash text,
  add column if not exists schedule_snapshot jsonb,
  add column if not exists program_binding_id uuid,
  add column if not exists canonical_order_reference text,
  add column if not exists original_settlement_reference text,
  add column if not exists settlement_reference text,
  add column if not exists idempotency_key text,
  add column if not exists operation_fingerprint text,
  add column if not exists event_kind text,
  add column if not exists period_key text,
  add column if not exists period_index integer,
  add column if not exists term_mode text,
  add column if not exists eligible_basis_delta_cents bigint,
  add column if not exists commission_delta_cents bigint,
  add column if not exists binding_authority_reference text,
  add column if not exists price_authority_reference text,
  add column if not exists attribution_snapshot jsonb,
  add column if not exists money_evidence_snapshot jsonb,
  add column if not exists revenue_snapshot jsonb,
  add column if not exists calculation_snapshot jsonb,
  add column if not exists reversal_authority_reference text,
  add column if not exists reversal_allocation_snapshot jsonb,
  add column if not exists entry_snapshot jsonb,
  add column if not exists occurred_at timestamptz;

do $commission_program_constraints$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'research_commission_program_schedule_fk'
      and conrelid = 'public.research_commission_ledger'::regclass
  ) then
    alter table public.research_commission_ledger
      add constraint research_commission_program_schedule_fk
      foreign key (program_id, schedule_version, schedule_hash)
      references public.research_commission_program_schedules(
        program_id, schedule_version, schedule_hash
      ) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'research_commission_program_binding_fk'
      and conrelid = 'public.research_commission_ledger'::regclass
  ) then
    alter table public.research_commission_ledger
      add constraint research_commission_program_binding_fk
      foreign key (program_binding_id)
      references public.research_partner_commission_program_bindings(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'research_commission_program_metadata_complete'
      and conrelid = 'public.research_commission_ledger'::regclass
  ) then
    alter table public.research_commission_ledger
      add constraint research_commission_program_metadata_complete check (
        (program_id is null and schedule_version is null and schedule_hash is null
          and schedule_snapshot is null and program_binding_id is null
          and canonical_order_reference is null and original_settlement_reference is null
          and settlement_reference is null and idempotency_key is null
          and operation_fingerprint is null and event_kind is null and period_key is null
          and period_index is null and term_mode is null
          and eligible_basis_delta_cents is null and commission_delta_cents is null
          and binding_authority_reference is null and price_authority_reference is null
          and attribution_snapshot is null and money_evidence_snapshot is null
          and revenue_snapshot is null and calculation_snapshot is null
          and reversal_authority_reference is null and reversal_allocation_snapshot is null
          and entry_snapshot is null and occurred_at is null)
        or coalesce((
          program_id is not null and schedule_version > 0
          and schedule_hash ~ '^[0-9a-f]{64}$' and schedule_snapshot is not null
          and program_binding_id is not null
          and length(btrim(canonical_order_reference)) >= 1
          and length(btrim(original_settlement_reference)) >= 1
          and length(btrim(settlement_reference)) >= 1
          and length(btrim(idempotency_key)) >= 3
          and operation_fingerprint ~ '^[0-9a-f]{64}$'
          and event_kind in ('accrual','refund_reversal','chargeback_reversal')
          and length(btrim(period_key)) >= 3 and period_index >= 0
          and term_mode in ('initial_term','post_term_tail')
          and eligible_basis_delta_cents <> 0 and commission_delta_cents is not null
          and length(btrim(binding_authority_reference)) >= 3
          and length(btrim(price_authority_reference)) >= 3
          and jsonb_typeof(attribution_snapshot) = 'object'
          and jsonb_typeof(money_evidence_snapshot) = 'object'
          and jsonb_typeof(calculation_snapshot) = 'object'
          and jsonb_typeof(entry_snapshot) = 'object'
          and occurred_at is not null
          and coalesce(schedule_snapshot->>'hashAlgorithm' = 'sha256', false)
          and coalesce(schedule_snapshot->>'scheduleHash' = schedule_hash, false)
          and coalesce(schedule_snapshot#>>'{definition,programId}' = program_id, false)
          and coalesce((schedule_snapshot#>>'{definition,version}')::integer = schedule_version, false)
          and coalesce(money_evidence_snapshot->>'settlementRef' = settlement_reference, false)
          and coalesce(money_evidence_snapshot->>'currency' = 'USD', false)
          and coalesce((money_evidence_snapshot->>'settledAt')::timestamptz = occurred_at, false)
          and (
            (event_kind = 'accrual' and state = 'pending' and kind = 'accrual'
              and reverses_ledger_id is null
              and original_settlement_reference = settlement_reference
              and eligible_basis_delta_cents > 0 and commission_delta_cents >= 0
              and jsonb_typeof(revenue_snapshot) = 'object'
              and reversal_authority_reference is null
              and reversal_allocation_snapshot is null)
            or
            (event_kind in ('refund_reversal','chargeback_reversal')
              and state = 'reversed' and kind = 'reversal'
              and reverses_ledger_id is not null
              and original_settlement_reference <> settlement_reference
              and eligible_basis_delta_cents < 0 and commission_delta_cents <= 0
              and revenue_snapshot is null
              and length(btrim(reversal_authority_reference)) >= 3
              and jsonb_typeof(reversal_allocation_snapshot) = 'object')
          )
        ), false)
      );
  end if;
end;
$commission_program_constraints$;

create unique index if not exists research_commission_program_idempotency_idx
  on public.research_commission_ledger(idempotency_key) where idempotency_key is not null;
create unique index if not exists research_commission_program_money_evidence_idx
  on public.research_commission_ledger(settlement_reference) where settlement_reference is not null;
create index if not exists research_commission_program_original_settlement_idx
  on public.research_commission_ledger(original_settlement_reference, created_at)
  where original_settlement_reference is not null;
create index if not exists research_commission_program_period_idx
  on public.research_commission_ledger(period_key, created_at) where period_key is not null;
create index if not exists research_commission_canonical_order_reference_idx
  on public.research_commission_ledger(canonical_order_reference, created_at)
  where canonical_order_reference is not null;

create table if not exists public.research_commission_period_ledger (
  id uuid primary key,
  period_key text not null check (length(btrim(period_key)) >= 3),
  revision integer not null check (revision > 0),
  source_ledger_id uuid not null unique
    references public.research_commission_ledger(id) on delete restrict,
  eligible_basis_delta_cents bigint not null check (eligible_basis_delta_cents <> 0),
  commission_delta_cents bigint not null,
  cumulative_eligible_basis_cents bigint not null check (cumulative_eligible_basis_cents >= 0),
  cumulative_commission_cents bigint not null check (cumulative_commission_cents >= 0),
  event_snapshot jsonb not null check (jsonb_typeof(event_snapshot) = 'object'),
  occurred_at timestamptz not null,
  unique (period_key, revision)
);

create table if not exists public.research_commission_state_events (
  id uuid primary key,
  ledger_id uuid not null references public.research_commission_ledger(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  from_state text not null
    check (from_state in ('pending','held','approved','payable','paid','reversed','disputed')),
  to_state text not null
    check (to_state in ('pending','held','approved','payable','paid','reversed','disputed')),
  authority_reference text not null check (length(btrim(authority_reference)) >= 3),
  payment_evidence_reference text,
  occurred_at timestamptz not null,
  idempotency_key text not null unique check (length(btrim(idempotency_key)) >= 3),
  operation_fingerprint text not null check (operation_fingerprint ~ '^[0-9a-f]{64}$'),
  event_snapshot jsonb not null check (jsonb_typeof(event_snapshot) = 'object'),
  unique (ledger_id, sequence),
  constraint research_commission_state_transition_graph check (
    (from_state = 'pending' and to_state in ('held','approved','disputed','reversed'))
    or (from_state = 'held' and to_state in ('approved','disputed','reversed'))
    or (from_state = 'approved' and to_state in ('payable','disputed','reversed'))
    or (from_state = 'payable' and to_state in ('paid','disputed','reversed'))
    or (from_state = 'paid' and to_state in ('disputed','reversed'))
    or (from_state = 'disputed' and to_state in ('held','approved','reversed'))
  ),
  check (
    to_state <> 'paid'
    or coalesce(length(btrim(payment_evidence_reference)) >= 3, false)
  )
);
create index if not exists research_commission_state_events_latest_idx
  on public.research_commission_state_events(ledger_id, sequence desc);

create or replace function private.research_program_commission_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'commission authority %.% is append-only', tg_table_schema, tg_table_name
    using errcode = '55000';
end;
$$;

create or replace function private.research_program_commission_insert_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner name;
begin
  if new.program_id is null then return new; end if;
  select r.rolname into v_owner
  from pg_catalog.pg_class c
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where c.oid = 'public.research_commission_ledger'::regclass;
  if current_user <> v_owner then
    raise exception 'program commission rows must use research_program_commission_commit'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists research_commission_program_schedules_no_update
  on public.research_commission_program_schedules;
create trigger research_commission_program_schedules_no_update
  before update or delete on public.research_commission_program_schedules
  for each row execute function private.research_program_commission_append_only();
drop trigger if exists research_partner_commission_bindings_no_update
  on public.research_partner_commission_program_bindings;
create trigger research_partner_commission_bindings_no_update
  before update or delete on public.research_partner_commission_program_bindings
  for each row execute function private.research_program_commission_append_only();
drop trigger if exists research_partner_commission_binding_events_no_update
  on public.research_partner_commission_program_binding_events;
create trigger research_partner_commission_binding_events_no_update
  before update or delete on public.research_partner_commission_program_binding_events
  for each row execute function private.research_program_commission_append_only();
drop trigger if exists research_commission_period_ledger_no_update
  on public.research_commission_period_ledger;
create trigger research_commission_period_ledger_no_update
  before update or delete on public.research_commission_period_ledger
  for each row execute function private.research_program_commission_append_only();
drop trigger if exists research_commission_state_events_no_update
  on public.research_commission_state_events;
create trigger research_commission_state_events_no_update
  before update or delete on public.research_commission_state_events
  for each row execute function private.research_program_commission_append_only();
drop trigger if exists research_commission_program_insert_guard
  on public.research_commission_ledger;
create trigger research_commission_program_insert_guard
  before insert on public.research_commission_ledger
  for each row execute function private.research_program_commission_insert_guard();

create or replace function private.research_program_commission_canonical_json(p_value jsonb)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_result text;
begin
  case pg_catalog.jsonb_typeof(p_value)
    when 'object' then
      select '{' || coalesce(pg_catalog.string_agg(
        pg_catalog.to_jsonb(item.key)::text || ':' ||
          private.research_program_commission_canonical_json(item.value),
        ',' order by item.key
      ), '') || '}' into v_result
      from pg_catalog.jsonb_each(p_value) item;
    when 'array' then
      select '[' || coalesce(pg_catalog.string_agg(
        private.research_program_commission_canonical_json(item.value),
        ',' order by item.ordinality
      ), '') || ']' into v_result
      from pg_catalog.jsonb_array_elements(p_value) with ordinality item(value, ordinality);
    else v_result := p_value::text;
  end case;
  return v_result;
end;
$$;

create or replace function private.research_program_commission_total(
  p_definition jsonb,
  p_basis_cents bigint,
  p_term_mode text
)
returns bigint
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_policy jsonb;
  v_band jsonb;
  v_kind text;
  v_rate bigint;
  v_through bigint;
  v_lower bigint := 0;
  v_remaining bigint := p_basis_cents;
  v_band_basis bigint;
  v_total numeric := 0;
begin
  if p_basis_cents < 0 or p_basis_cents > 9007199254740991
     or p_term_mode not in ('initial_term','post_term_tail') then
    raise exception 'invalid commission total input' using errcode = '22023';
  end if;
  v_policy := case when p_term_mode = 'post_term_tail'
    then p_definition->'postTermTailRatePolicy' else p_definition->'ratePolicy' end;
  if pg_catalog.jsonb_typeof(v_policy) is distinct from 'object' then
    raise exception 'schedule has no applicable rate policy' using errcode = '22023';
  end if;
  v_kind := v_policy->>'kind';
  if v_kind = 'flat' then
    if pg_catalog.jsonb_typeof(v_policy->'rateBasisPoints') is distinct from 'number' then
      raise exception 'flat schedule rate is invalid' using errcode = '22023';
    end if;
    v_rate := (v_policy->>'rateBasisPoints')::bigint;
    if v_rate < 0 or v_rate > 10000 then
      raise exception 'flat schedule rate is invalid' using errcode = '22023';
    end if;
    v_total := pg_catalog.floor(p_basis_cents::numeric * v_rate::numeric / 10000);
  elsif v_kind = 'marginal_period' then
    if pg_catalog.jsonb_typeof(v_policy->'bands') is distinct from 'array'
       or pg_catalog.jsonb_array_length(v_policy->'bands') = 0 then
      raise exception 'marginal schedule bands are invalid' using errcode = '22023';
    end if;
    for v_band in select value from pg_catalog.jsonb_array_elements(v_policy->'bands') loop
      if pg_catalog.jsonb_typeof(v_band) is distinct from 'object'
         or pg_catalog.jsonb_typeof(v_band->'rateBasisPoints') is distinct from 'number'
         or not (v_band ? 'throughCents') then
        raise exception 'marginal schedule band is invalid' using errcode = '22023';
      end if;
      v_rate := (v_band->>'rateBasisPoints')::bigint;
      if v_rate < 0 or v_rate > 10000 then
        raise exception 'marginal schedule rate is invalid' using errcode = '22023';
      end if;
      if v_band->'throughCents' = 'null'::jsonb then
        v_band_basis := v_remaining;
      else
        if pg_catalog.jsonb_typeof(v_band->'throughCents') is distinct from 'number' then
          raise exception 'marginal schedule threshold is invalid' using errcode = '22023';
        end if;
        v_through := (v_band->>'throughCents')::bigint;
        if v_through <= v_lower then
          raise exception 'marginal schedule thresholds are not increasing' using errcode = '22023';
        end if;
        v_band_basis := case when v_remaining < v_through - v_lower
          then v_remaining else v_through - v_lower end;
      end if;
      v_total := v_total + pg_catalog.floor(v_band_basis::numeric * v_rate::numeric / 10000);
      v_remaining := v_remaining - v_band_basis;
      if v_band->'throughCents' <> 'null'::jsonb then v_lower := v_through; end if;
      exit when v_remaining = 0;
    end loop;
    if v_remaining <> 0 then
      raise exception 'marginal schedule does not cover basis' using errcode = '22023';
    end if;
  else
    raise exception 'unknown schedule rate policy' using errcode = '22023';
  end if;
  if v_total < 0 or v_total > 9007199254740991 then
    raise exception 'commission total exceeds safe integer cents' using errcode = '22003';
  end if;
  return v_total::bigint;
end;
$$;

create or replace function private.research_program_commission_revenue_basis(
  p_revenue jsonb,
  p_settlement_cents bigint
)
returns bigint
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_gross bigint;
  v_eligible bigint;
  v_settlement bigint;
  v_component jsonb;
  v_kind text;
  v_amount bigint;
  v_seen text[] := array[]::text[];
  v_pre numeric := 0;
  v_excluded numeric := 0;
begin
  if pg_catalog.jsonb_typeof(p_revenue) is distinct from 'object'
     or not (p_revenue ?& array[
       'grossEligibleProductChannelCents','preCollectionAdjustments',
       'eligibleProductChannelCollectedCents','collectedExclusions','settlementAmountCents'
     ])
     or pg_catalog.jsonb_typeof(p_revenue->'grossEligibleProductChannelCents') is distinct from 'number'
     or pg_catalog.jsonb_typeof(p_revenue->'eligibleProductChannelCollectedCents') is distinct from 'number'
     or pg_catalog.jsonb_typeof(p_revenue->'settlementAmountCents') is distinct from 'number'
     or pg_catalog.jsonb_typeof(p_revenue->'preCollectionAdjustments') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_revenue->'collectedExclusions') is distinct from 'array' then
    raise exception 'invalid revenue snapshot shape' using errcode = '22023';
  end if;
  v_gross := (p_revenue->>'grossEligibleProductChannelCents')::bigint;
  v_eligible := (p_revenue->>'eligibleProductChannelCollectedCents')::bigint;
  v_settlement := (p_revenue->>'settlementAmountCents')::bigint;
  if v_gross < 0 or v_eligible < 0 or v_settlement < 0
     or v_gross > 9007199254740991 or v_eligible > 9007199254740991
     or v_settlement > 9007199254740991 or v_settlement <> p_settlement_cents then
    raise exception 'invalid revenue snapshot totals' using errcode = '22023';
  end if;
  for v_component in select value from pg_catalog.jsonb_array_elements(
    p_revenue->'preCollectionAdjustments'
  ) loop
    if pg_catalog.jsonb_typeof(v_component) is distinct from 'object'
       or not (v_component ?& array['kind','amountCents','authorityReference'])
       or pg_catalog.jsonb_typeof(v_component->'kind') is distinct from 'string'
       or pg_catalog.jsonb_typeof(v_component->'amountCents') is distinct from 'number'
       or coalesce(
         pg_catalog.jsonb_typeof(v_component->'authorityReference') in ('string','null'),
         false
       ) = false then
      raise exception 'invalid pre-collection component' using errcode = '22023';
    end if;
    v_kind := v_component->>'kind'; v_amount := (v_component->>'amountCents')::bigint;
    if v_kind not in ('discount','credit','complimentary_value')
       or v_kind = any(v_seen) or v_amount <= 0 or v_amount > 9007199254740991 then
      raise exception 'invalid or duplicate pre-collection component' using errcode = '22023';
    end if;
    v_seen := pg_catalog.array_append(v_seen,v_kind); v_pre := v_pre + v_amount;
  end loop;
  v_seen := array[]::text[];
  for v_component in select value from pg_catalog.jsonb_array_elements(
    p_revenue->'collectedExclusions'
  ) loop
    if pg_catalog.jsonb_typeof(v_component) is distinct from 'object'
       or not (v_component ?& array['kind','amountCents','authorityReference'])
       or pg_catalog.jsonb_typeof(v_component->'kind') is distinct from 'string'
       or pg_catalog.jsonb_typeof(v_component->'amountCents') is distinct from 'number'
       or coalesce(
         pg_catalog.jsonb_typeof(v_component->'authorityReference') in ('string','null'),
         false
       ) = false then
      raise exception 'invalid collected exclusion component' using errcode = '22023';
    end if;
    v_kind := v_component->>'kind'; v_amount := (v_component->>'amountCents')::bigint;
    if v_kind not in (
      'tax','shipping_pass_through','fraud_or_duplicate','clinical_professional_fee',
      'patient_referral','medication_or_pharmacy_revenue','laboratory_revenue',
      'prescription_revenue','care_clinical_charge','other_written_exclusion'
    ) or v_kind = any(v_seen) or v_amount <= 0 or v_amount > 9007199254740991
       or (v_kind = 'other_written_exclusion'
         and coalesce(pg_catalog.length(pg_catalog.btrim(v_component->>'authorityReference')),0) < 1) then
      raise exception 'invalid or duplicate collected exclusion' using errcode = '22023';
    end if;
    v_seen := pg_catalog.array_append(v_seen,v_kind); v_excluded := v_excluded + v_amount;
  end loop;
  if v_pre > 9007199254740991 or v_excluded > 9007199254740991
     or v_gross::numeric - v_pre <> v_eligible
     or v_eligible::numeric + v_excluded <> v_settlement then
    raise exception 'revenue snapshot does not reconcile to collected cash' using errcode = '22023';
  end if;
  return v_eligible;
end;
$$;

create or replace function private.research_program_commission_validate_reversal(
  p_allocation jsonb,
  p_adjustment_cents bigint,
  p_basis_reduction bigint,
  p_original_revenue jsonb
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_component jsonb;
  v_kind text;
  v_amount bigint;
  v_seen text[] := array[]::text[];
  v_total numeric := 0;
  v_eligible bigint := 0;
  v_expected_hash text;
begin
  if pg_catalog.jsonb_typeof(p_allocation) is distinct from 'object'
     or not (p_allocation ?& array[
       'allocationReference','originalRevenueSnapshotHash',
       'eligibleBasisReductionCents','components'
     ])
     or pg_catalog.jsonb_typeof(p_allocation->'allocationReference') is distinct from 'string'
     or coalesce(pg_catalog.length(pg_catalog.btrim(p_allocation->>'allocationReference')),0) < 3
     or pg_catalog.jsonb_typeof(p_allocation->'originalRevenueSnapshotHash') is distinct from 'string'
     or coalesce((p_allocation->>'originalRevenueSnapshotHash') ~ '^[0-9a-f]{64}$',false) = false
     or pg_catalog.jsonb_typeof(p_allocation->'eligibleBasisReductionCents') is distinct from 'number'
     or pg_catalog.jsonb_typeof(p_allocation->'components') is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_allocation->'components') = 0 then
    raise exception 'invalid reversal allocation shape' using errcode = '22023';
  end if;
  v_expected_hash := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    private.research_program_commission_canonical_json(p_original_revenue),'UTF8'
  ),'sha256'),'hex');
  if p_allocation->>'originalRevenueSnapshotHash' <> v_expected_hash
     or (p_allocation->>'eligibleBasisReductionCents')::bigint <> p_basis_reduction
     or p_basis_reduction <= 0 or p_basis_reduction > 9007199254740991 then
    raise exception 'reversal allocation does not bind eligible basis to original revenue'
      using errcode = '22023';
  end if;
  for v_component in select value from pg_catalog.jsonb_array_elements(p_allocation->'components') loop
    if pg_catalog.jsonb_typeof(v_component) is distinct from 'object'
       or not (v_component ?& array['kind','amountCents','authorityReference'])
       or pg_catalog.jsonb_typeof(v_component->'kind') is distinct from 'string'
       or pg_catalog.jsonb_typeof(v_component->'amountCents') is distinct from 'number'
       or coalesce(
         pg_catalog.jsonb_typeof(v_component->'authorityReference') in ('string','null'),
         false
       ) = false then
      raise exception 'invalid reversal allocation component' using errcode = '22023';
    end if;
    v_kind := v_component->>'kind'; v_amount := (v_component->>'amountCents')::bigint;
    if v_kind not in (
      'eligible_product_channel','tax','shipping_pass_through','fraud_or_duplicate',
      'clinical_professional_fee','patient_referral','medication_or_pharmacy_revenue',
      'laboratory_revenue','prescription_revenue','care_clinical_charge','other_written_exclusion'
    ) or v_kind = any(v_seen) or v_amount <= 0 or v_amount > 9007199254740991
       or (v_kind = 'other_written_exclusion'
         and coalesce(pg_catalog.length(pg_catalog.btrim(v_component->>'authorityReference')),0) < 1) then
      raise exception 'invalid or duplicate reversal allocation component' using errcode = '22023';
    end if;
    v_seen := pg_catalog.array_append(v_seen,v_kind); v_total := v_total + v_amount;
    if v_kind = 'eligible_product_channel' then v_eligible := v_amount; end if;
  end loop;
  if v_total <> p_adjustment_cents or v_eligible <> p_basis_reduction then
    raise exception 'reversal allocation does not reconcile to adjustment cash'
      using errcode = '22023';
  end if;
  return true;
end;
$$;

create or replace function private.research_program_commission_bind(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_id uuid;
  v_partner_id uuid;
  v_program_id text;
  v_version integer;
  v_hash text;
  v_effective_at timestamptz;
  v_recorded_at timestamptz;
  v_key text;
  v_fingerprint text;
  v_supplied_fingerprint text;
  v_existing record;
  v_schedule record;
begin
  if p_command is null or pg_catalog.jsonb_typeof(p_command) is distinct from 'object'
     or not (p_command ?& array[
       'bindingId','partnerId','programId','scheduleVersion','scheduleHash',
       'effectiveAt','authorityReference','recordedAt','recordedBy',
       'idempotencyKey','operationFingerprint'
     ]) then
    raise exception 'invalid commission binding command' using errcode = '22023';
  end if;
  v_id := (p_command->>'bindingId')::uuid;
  v_partner_id := (p_command->>'partnerId')::uuid;
  v_program_id := p_command->>'programId';
  v_version := (p_command->>'scheduleVersion')::integer;
  v_hash := p_command->>'scheduleHash';
  v_effective_at := (p_command->>'effectiveAt')::timestamptz;
  v_recorded_at := (p_command->>'recordedAt')::timestamptz;
  v_key := p_command->>'idempotencyKey';
  v_supplied_fingerprint := p_command->>'operationFingerprint';
  v_fingerprint := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(
      private.research_program_commission_canonical_json(
        pg_catalog.jsonb_build_object(
          'kind','bind',
          'command',p_command - 'operationFingerprint'
        )
      ),
      'UTF8'
    ),'sha256'),
    'hex'
  );
  if v_id is null or v_partner_id is null or v_version is null or v_version <= 0
     or v_effective_at is null or v_recorded_at is null
     or coalesce(pg_catalog.length(pg_catalog.btrim(v_program_id)),0) < 3
     or coalesce(pg_catalog.length(pg_catalog.btrim(v_key)),0) < 3
     or coalesce(v_hash ~ '^[0-9a-f]{64}$',false) = false
     or coalesce(v_supplied_fingerprint ~ '^[0-9a-f]{64}$',false) = false
     or v_supplied_fingerprint is distinct from v_fingerprint
     or coalesce(pg_catalog.length(pg_catalog.btrim(p_command->>'authorityReference')),0) < 3
     or coalesce(pg_catalog.length(pg_catalog.btrim(p_command->>'recordedBy')),0) < 3 then
    raise exception 'invalid commission binding evidence' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commission-binding-idempotency:' || v_key, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commission-binding:' || v_partner_id::text, 0)
  );
  select id, operation_fingerprint into v_existing
  from public.research_partner_commission_program_bindings where idempotency_key = v_key;
  if found then
    return pg_catalog.jsonb_build_object(
      'status', case when v_existing.operation_fingerprint = v_fingerprint
        then 'replayed' else 'idempotency_conflict' end,
      'bindingId', v_existing.id
    );
  end if;
  if exists (
    select 1 from public.research_partner_commission_program_bindings where id = v_id
  ) then
    return pg_catalog.jsonb_build_object('status','idempotency_conflict','bindingId',v_id);
  end if;

  select definition, effective_at into v_schedule
  from public.research_commission_program_schedules
  where program_id = v_program_id and schedule_version = v_version and schedule_hash = v_hash;
  if not found or v_effective_at < v_schedule.effective_at
     or (v_schedule.definition#>>'{measurementPeriod,anchor}' = 'contract_effective_at'
       and v_effective_at <> v_schedule.effective_at) then
    raise exception 'binding does not match an effective reviewed schedule' using errcode = '22023';
  end if;
  if not exists (select 1 from public.research_partners where id = v_partner_id) then
    raise exception 'binding partner does not exist' using errcode = '23503';
  end if;
  if exists (
    select 1
    from public.research_partner_commission_program_bindings b
    left join public.research_partner_commission_program_binding_events e
      on e.binding_id = b.id and e.event_kind = 'terminated'
    where b.partner_id = v_partner_id
      and (e.effective_at is null or e.effective_at > v_effective_at)
  ) then
    return pg_catalog.jsonb_build_object('status','binding_contention','bindingId',v_id);
  end if;

  insert into public.research_partner_commission_program_bindings(
    id, partner_id, program_id, schedule_version, schedule_hash, effective_at,
    authority_reference, recorded_at, recorded_by, idempotency_key, operation_fingerprint
  ) values (
    v_id, v_partner_id, v_program_id, v_version, v_hash, v_effective_at,
    p_command->>'authorityReference', v_recorded_at, p_command->>'recordedBy', v_key, v_fingerprint
  );
  return pg_catalog.jsonb_build_object('status','committed','bindingId',v_id);
end;
$$;

create or replace function private.research_program_commission_terminate_binding(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_binding_id uuid;
  v_partner_id uuid;
  v_effective_at timestamptz;
  v_recorded_at timestamptz;
  v_key text;
  v_fingerprint text;
  v_supplied_fingerprint text;
  v_existing record;
  v_binding record;
begin
  if p_command is null or pg_catalog.jsonb_typeof(p_command) is distinct from 'object'
     or not (p_command ?& array[
       'eventId','bindingId','effectiveAt','authorityReference','recordedAt',
       'recordedBy','idempotencyKey','operationFingerprint'
     ]) then
    raise exception 'invalid binding lifecycle command' using errcode = '22023';
  end if;
  v_id := (p_command->>'eventId')::uuid;
  v_binding_id := (p_command->>'bindingId')::uuid;
  v_effective_at := (p_command->>'effectiveAt')::timestamptz;
  v_recorded_at := (p_command->>'recordedAt')::timestamptz;
  v_key := p_command->>'idempotencyKey';
  v_supplied_fingerprint := p_command->>'operationFingerprint';
  v_fingerprint := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(
      private.research_program_commission_canonical_json(
        pg_catalog.jsonb_build_object(
          'kind','terminate_binding',
          'command',p_command - 'operationFingerprint'
        )
      ),
      'UTF8'
    ),'sha256'),
    'hex'
  );
  if v_id is null or v_binding_id is null or v_effective_at is null or v_recorded_at is null
     or coalesce(pg_catalog.length(pg_catalog.btrim(v_key)),0) < 3
     or coalesce(v_supplied_fingerprint ~ '^[0-9a-f]{64}$',false) = false
     or v_supplied_fingerprint is distinct from v_fingerprint
     or coalesce(pg_catalog.length(pg_catalog.btrim(p_command->>'authorityReference')),0) < 3
     or coalesce(pg_catalog.length(pg_catalog.btrim(p_command->>'recordedBy')),0) < 3 then
    raise exception 'invalid binding lifecycle evidence' using errcode = '22023';
  end if;
  select partner_id, effective_at into v_binding
  from public.research_partner_commission_program_bindings where id = v_binding_id;
  if not found then raise exception 'binding does not exist' using errcode = '23503'; end if;
  v_partner_id := v_binding.partner_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commission-binding-idempotency:' || v_key, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commission-binding:' || v_partner_id::text, 0)
  );

  select id, operation_fingerprint into v_existing
  from public.research_partner_commission_program_binding_events where idempotency_key = v_key;
  if found then
    return pg_catalog.jsonb_build_object(
      'status', case when v_existing.operation_fingerprint = v_fingerprint
        then 'replayed' else 'idempotency_conflict' end,
      'eventId', v_existing.id
    );
  end if;
  if v_effective_at <= v_binding.effective_at then
    raise exception 'termination must be after binding effective time' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.research_partner_commission_program_binding_events
    where binding_id = v_binding_id and event_kind = 'terminated'
  ) then
    return pg_catalog.jsonb_build_object('status','binding_contention','eventId',v_id);
  end if;
  insert into public.research_partner_commission_program_binding_events(
    id, binding_id, sequence, event_kind, effective_at, authority_reference,
    recorded_at, recorded_by, idempotency_key, operation_fingerprint
  ) values (
    v_id, v_binding_id, 1, 'terminated', v_effective_at, p_command->>'authorityReference',
    v_recorded_at, p_command->>'recordedBy', v_key, v_fingerprint
  );
  return pg_catalog.jsonb_build_object('status','committed','eventId',v_id);
end;
$$;

create or replace function private.research_program_commission_commit(
  p_operation jsonb,
  p_expected_period_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_entry jsonb;
  v_period jsonb;
  v_entry_id uuid;
  v_period_id uuid;
  v_partner_id uuid;
  v_order_id uuid;
  v_binding_id uuid;
  v_reverses_id uuid;
  v_key text;
  v_fingerprint text;
  v_settlement_ref text;
  v_original_ref text;
  v_event_kind text;
  v_period_key text;
  v_program_id text;
  v_schedule_version integer;
  v_schedule_hash text;
  v_period_index integer;
  v_term_mode text;
  v_basis_delta bigint;
  v_commission_delta bigint;
  v_cumulative_basis bigint;
  v_cumulative_commission bigint;
  v_current_revision integer := 0;
  v_current_basis bigint := 0;
  v_current_commission bigint := 0;
  v_current_occurred timestamptz;
  v_occurred_at timestamptz;
  v_amount bigint;
  v_basis_points integer;
  v_schedule_definition jsonb;
  v_binding_authority text;
  v_binding_effective timestamptz;
  v_schedule_effective timestamptz;
  v_anchor timestamptz;
  v_expected_period_start timestamptz;
  v_expected_period_end timestamptz;
  v_expected_before bigint;
  v_expected_after bigint;
  v_revenue_basis bigint;
  v_original_revenue jsonb;
  v_original_occurred timestamptz;
  v_attribution_first timestamptz;
  v_attribution_months integer;
  v_partner_state text;
  v_outstanding_basis numeric;
  v_existing record;
begin
  if p_operation is null or pg_catalog.jsonb_typeof(p_operation) is distinct from 'object'
     or not (p_operation ?& array['idempotencyKey','fingerprint','entry','periodEvent'])
     or p_expected_period_revision is null or p_expected_period_revision < 0 then
    raise exception 'invalid commission operation envelope' using errcode = '22023';
  end if;
  v_entry := p_operation->'entry';
  v_period := p_operation->'periodEvent';
  if pg_catalog.jsonb_typeof(v_entry) is distinct from 'object'
     or pg_catalog.jsonb_typeof(v_period) is distinct from 'object'
     or not (v_entry ?& array[
       'entryId','eventKind','partnerId','orderId','canonicalOrderId',
       'originalSettlementRef','reversesEntryId','moneyEvidence','bindingId',
       'bindingAuthorityReference','programId','scheduleVersion','scheduleHash',
       'scheduleSnapshot','periodKey','period','termMode','eligibleBasisDeltaCents',
       'commissionDeltaCents','calculation','revenueSnapshot','attributionSnapshot',
       'priceAuthorityReference','reversalAuthorityReference',
       'reversalAllocationSnapshot','initialState','occurredAt'
     ])
     or not (v_period ?& array[
       'periodEventId','periodKey','revision','sourceEntryId','partnerId','bindingId',
       'programId','scheduleVersion','scheduleHash','period','termMode',
       'eligibleBasisDeltaCents','commissionDeltaCents',
       'cumulativeEligibleBasisCents','cumulativeCommissionCents','occurredAt'
     ])
     or pg_catalog.jsonb_typeof(v_entry->'moneyEvidence') is distinct from 'object'
     or not ((v_entry->'moneyEvidence') ?& array[
       'settlementRef','externalTransactionRef','amountCents','currency','settledAt'
     ])
     or pg_catalog.jsonb_typeof(v_entry#>'{moneyEvidence,settlementRef}') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_entry#>'{moneyEvidence,externalTransactionRef}') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_entry#>'{moneyEvidence,amountCents}') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_entry#>'{moneyEvidence,currency}') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_entry#>'{moneyEvidence,settledAt}') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_entry->'period') is distinct from 'object'
     or not ((v_entry->'period') ?& array['index','startsAt','endsAt'])
     or pg_catalog.jsonb_typeof(v_entry#>'{period,index}') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_entry#>'{period,startsAt}') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_entry#>'{period,endsAt}') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_entry->'scheduleVersion') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_entry->'eligibleBasisDeltaCents') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_entry->'commissionDeltaCents') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_period->'revision') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_period->'cumulativeEligibleBasisCents') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_period->'cumulativeCommissionCents') is distinct from 'number' then
    raise exception 'commission operation snapshots are required' using errcode = '22023';
  end if;

  v_key := p_operation->>'idempotencyKey';
  v_fingerprint := p_operation->>'fingerprint';
  v_entry_id := (v_entry->>'entryId')::uuid;
  v_period_id := (v_period->>'periodEventId')::uuid;
  v_partner_id := (v_entry->>'partnerId')::uuid;
  v_order_id := (v_entry->>'canonicalOrderId')::uuid;
  v_binding_id := (v_entry->>'bindingId')::uuid;
  v_settlement_ref := v_entry#>>'{moneyEvidence,settlementRef}';
  v_original_ref := v_entry->>'originalSettlementRef';
  v_event_kind := v_entry->>'eventKind';
  v_period_key := v_entry->>'periodKey';
  v_program_id := v_entry->>'programId';
  v_schedule_version := (v_entry->>'scheduleVersion')::integer;
  v_schedule_hash := v_entry->>'scheduleHash';
  v_period_index := (v_entry#>>'{period,index}')::integer;
  v_term_mode := v_entry->>'termMode';
  v_basis_delta := (v_entry->>'eligibleBasisDeltaCents')::bigint;
  v_commission_delta := (v_entry->>'commissionDeltaCents')::bigint;
  v_cumulative_basis := (v_period->>'cumulativeEligibleBasisCents')::bigint;
  v_cumulative_commission := (v_period->>'cumulativeCommissionCents')::bigint;
  v_occurred_at := (v_entry->>'occurredAt')::timestamptz;
  v_amount := (v_entry#>>'{moneyEvidence,amountCents}')::bigint;
  v_attribution_first :=
    (v_entry#>>'{attributionSnapshot,firstEligibleTransactionAt}')::timestamptz;
  if v_entry->>'reversesEntryId' is not null then
    v_reverses_id := (v_entry->>'reversesEntryId')::uuid;
  end if;

  if v_entry_id is null or v_period_id is null or v_partner_id is null or v_order_id is null
     or v_binding_id is null or v_schedule_version is null or v_period_index is null
     or v_basis_delta is null or v_commission_delta is null or v_cumulative_basis is null
     or v_cumulative_commission is null or v_occurred_at is null or v_amount is null
     or coalesce(pg_catalog.length(pg_catalog.btrim(v_key)),0) < 3
     or coalesce(v_fingerprint ~ '^[0-9a-f]{64}$',false) = false
     or coalesce(pg_catalog.length(pg_catalog.btrim(v_settlement_ref)),0) < 1
     or coalesce(pg_catalog.length(pg_catalog.btrim(v_original_ref)),0) < 1
     or coalesce(pg_catalog.length(pg_catalog.btrim(v_entry->>'orderId')),0) < 1
     or coalesce(pg_catalog.length(pg_catalog.btrim(v_entry#>>'{moneyEvidence,externalTransactionRef}')),0) < 1
     or coalesce(pg_catalog.length(pg_catalog.btrim(v_entry->>'bindingAuthorityReference')),0) < 3
     or coalesce(pg_catalog.length(pg_catalog.btrim(v_entry->>'priceAuthorityReference')),0) < 3
     or coalesce(v_schedule_hash ~ '^[0-9a-f]{64}$',false) = false
     or coalesce(v_event_kind in ('accrual','refund_reversal','chargeback_reversal'),false) = false
     or coalesce(v_term_mode in ('initial_term','post_term_tail'),false) = false
     or v_schedule_version <= 0 or v_period_index < 0
     or v_basis_delta = 0 or v_amount <= 0
     or v_amount > 9007199254740991
     or pg_catalog.abs(v_basis_delta) > 9007199254740991
     or pg_catalog.abs(v_commission_delta) > 9007199254740991
     or v_cumulative_basis < 0 or v_cumulative_basis > 9007199254740991
     or v_cumulative_commission < 0 or v_cumulative_commission > 9007199254740991
     or (v_entry#>>'{moneyEvidence,currency}') is distinct from 'USD'
     or (v_entry#>>'{moneyEvidence,settledAt}')::timestamptz is distinct from v_occurred_at
     or pg_catalog.jsonb_typeof(v_entry->'attributionSnapshot') is distinct from 'object'
     or not ((v_entry->'attributionSnapshot') ?& array[
       'customerBindingKey','acceptedRelationshipReference','firstEligibleTransactionAt',
       'activeManagementConfirmed'
     ])
     or coalesce(pg_catalog.length(pg_catalog.btrim(
       v_entry#>>'{attributionSnapshot,customerBindingKey}'
     )),0) < 3
     or coalesce(pg_catalog.length(pg_catalog.btrim(
       v_entry#>>'{attributionSnapshot,acceptedRelationshipReference}'
     )),0) < 1
     or pg_catalog.jsonb_typeof(v_entry#>'{attributionSnapshot,customerBindingKey}')
       is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_entry#>'{attributionSnapshot,acceptedRelationshipReference}')
       is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_entry#>'{attributionSnapshot,firstEligibleTransactionAt}')
       is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_entry#>'{attributionSnapshot,activeManagementConfirmed}')
       is distinct from 'boolean'
      or v_attribution_first > v_occurred_at
     or pg_catalog.jsonb_typeof(v_entry->'calculation') is distinct from 'object'
     or not ((v_entry->'calculation') ?& array['eligibleBasisCents','commissionCents','components'])
     or pg_catalog.jsonb_typeof(v_entry#>'{calculation,eligibleBasisCents}') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_entry#>'{calculation,commissionCents}') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_entry#>'{calculation,components}') is distinct from 'array'
     or (v_entry#>>'{calculation,eligibleBasisCents}')::bigint <> pg_catalog.abs(v_basis_delta)
     or (v_entry#>>'{calculation,commissionCents}')::bigint <> pg_catalog.abs(v_commission_delta)
     or pg_catalog.jsonb_typeof(v_entry->'scheduleSnapshot') is distinct from 'object'
     or not ((v_entry->'scheduleSnapshot') ?& array['definition','hashAlgorithm','scheduleHash'])
     or pg_catalog.jsonb_typeof(v_period->'period') is distinct from 'object' then
    raise exception 'invalid commission operation snapshot' using errcode = '22023';
  end if;
  if v_period->>'sourceEntryId' is distinct from v_entry_id::text
     or v_period->>'periodKey' is distinct from v_period_key
     or (v_period->>'partnerId')::uuid is distinct from v_partner_id
     or (v_period->>'bindingId')::uuid is distinct from v_binding_id
     or v_period->>'programId' is distinct from v_program_id
     or (v_period->>'scheduleVersion')::integer is distinct from v_schedule_version
     or v_period->>'scheduleHash' is distinct from v_schedule_hash
     or v_period->>'termMode' is distinct from v_term_mode
     or (v_period->>'eligibleBasisDeltaCents')::bigint is distinct from v_basis_delta
     or (v_period->>'commissionDeltaCents')::bigint is distinct from v_commission_delta
     or (v_period->>'occurredAt')::timestamptz is distinct from v_occurred_at
     or v_period->'period' is distinct from v_entry->'period' then
    raise exception 'period event does not exactly match ledger entry' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commission-idempotency:' || v_key, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commission-period:' || v_period_key, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commission-binding:' || v_partner_id::text, 0)
  );
  select id, operation_fingerprint into v_existing
  from public.research_commission_ledger where idempotency_key = v_key;
  if found then
    return pg_catalog.jsonb_build_object(
      'status', case when v_existing.operation_fingerprint = v_fingerprint
        then 'replayed' else 'idempotency_conflict' end,
      'entryId', v_existing.id
    );
  end if;
  if exists (
    select 1 from public.research_commission_ledger
    where settlement_reference = v_settlement_ref
  ) then return pg_catalog.jsonb_build_object('status','canonical_money_reused'); end if;

  select revision, cumulative_eligible_basis_cents, cumulative_commission_cents, occurred_at
    into v_current_revision, v_current_basis, v_current_commission, v_current_occurred
  from public.research_commission_period_ledger
  where period_key = v_period_key order by revision desc limit 1 for update;
  if not found then
    v_current_revision := 0; v_current_basis := 0; v_current_commission := 0;
  end if;
  if v_current_revision <> p_expected_period_revision
     or (v_period->>'revision')::integer <> v_current_revision + 1 then
    return pg_catalog.jsonb_build_object('status','period_contention');
  end if;
  if v_current_occurred is not null and v_occurred_at < v_current_occurred then
    raise exception 'commission period events must be appended in occurrence order'
      using errcode = '22023';
  end if;
  if v_current_basis + v_basis_delta <> v_cumulative_basis
     or v_current_commission + v_commission_delta <> v_cumulative_commission then
    raise exception 'period cumulative values do not reconcile' using errcode = '22023';
  end if;

  select s.definition, b.authority_reference, b.effective_at, s.effective_at
    into v_schedule_definition, v_binding_authority, v_binding_effective, v_schedule_effective
  from public.research_commission_program_schedules s
  join public.research_partner_commission_program_bindings b
    on b.program_id = s.program_id and b.schedule_version = s.schedule_version
    and b.schedule_hash = s.schedule_hash
  where s.program_id = v_program_id and s.schedule_version = v_schedule_version
    and s.schedule_hash = v_schedule_hash and b.id = v_binding_id
    and b.partner_id = v_partner_id
    and (
      v_event_kind <> 'accrual'
      or (
        b.effective_at <= v_occurred_at
        and not exists (
          select 1 from public.research_partner_commission_program_binding_events lifecycle
          where lifecycle.binding_id = b.id and lifecycle.event_kind = 'terminated'
            and lifecycle.effective_at <= v_occurred_at
        )
      )
    );
  if not found or v_binding_authority is distinct from v_entry->>'bindingAuthorityReference'
     or v_entry#>>'{scheduleSnapshot,hashAlgorithm}' is distinct from 'sha256'
     or v_entry#>>'{scheduleSnapshot,scheduleHash}' is distinct from v_schedule_hash
     or v_entry#>'{scheduleSnapshot,definition}' is distinct from v_schedule_definition then
    raise exception 'entry does not match immutable schedule and binding authority' using errcode = '22023';
  end if;

  v_anchor := case
    when v_schedule_definition#>>'{measurementPeriod,anchor}' = 'contract_effective_at'
      then v_schedule_effective
    when v_schedule_definition#>>'{measurementPeriod,anchor}' = 'binding_effective_at'
      then v_binding_effective
    else null
  end;
  if v_anchor is null or v_occurred_at < v_anchor
     or pg_catalog.jsonb_typeof(v_schedule_definition#>'{measurementPeriod,days}')
       is distinct from 'number'
     or (v_schedule_definition#>>'{measurementPeriod,days}')::integer <= 0 then
    raise exception 'schedule period anchor is invalid' using errcode = '22023';
  end if;
  v_expected_period_start := v_anchor +
    ((v_schedule_definition#>>'{measurementPeriod,days}')::integer * v_period_index) * interval '1 day';
  v_expected_period_end := v_expected_period_start +
    (v_schedule_definition#>>'{measurementPeriod,days}')::integer * interval '1 day';
  if (v_entry#>>'{period,startsAt}')::timestamptz is distinct from v_expected_period_start
     or (v_entry#>>'{period,endsAt}')::timestamptz is distinct from v_expected_period_end
     or (
       v_event_kind = 'accrual'
       and (v_occurred_at < v_expected_period_start or v_occurred_at >= v_expected_period_end)
     )
     or v_period_key is distinct from (
       v_binding_id::text || ':' || v_period_index::text || ':' || v_term_mode
     ) then
    raise exception 'entry period does not match schedule boundary' using errcode = '22023';
  end if;
  if v_event_kind = 'accrual' then
    if v_occurred_at < v_anchor +
        (v_schedule_definition->>'initialTermDays')::integer * interval '1 day' then
      if v_term_mode <> 'initial_term' then
        raise exception 'initial-term event has wrong term mode' using errcode = '22023';
      end if;
    elsif v_term_mode <> 'post_term_tail'
       or pg_catalog.jsonb_typeof(v_schedule_definition->'postTermTailRatePolicy')
         is distinct from 'object' then
      raise exception 'post-term event has no authorized tail' using errcode = '22023';
    end if;

    select lifecycle.to_state into v_partner_state
    from public.research_partner_lifecycle_events lifecycle
    where lifecycle.partner_id = v_partner_id and lifecycle.occurred_at <= v_occurred_at
    order by lifecycle.occurred_at desc, lifecycle.id desc
    limit 1;
    if not found or v_partner_state is distinct from 'active' then
      raise exception 'partner was not active at commission occurrence' using errcode = '22023';
    end if;

    if pg_catalog.jsonb_typeof(v_schedule_definition#>'{customerAttribution,durationMonths}')
         is distinct from 'null' then
      if pg_catalog.jsonb_typeof(v_schedule_definition#>'{customerAttribution,durationMonths}')
           is distinct from 'number' then
        raise exception 'schedule attribution duration is invalid' using errcode = '22023';
      end if;
      v_attribution_months :=
        (v_schedule_definition#>>'{customerAttribution,durationMonths}')::integer;
      if v_attribution_months <= 0
         or v_occurred_at >= v_attribution_first +
           pg_catalog.make_interval(months => v_attribution_months) then
        raise exception 'commission attribution window expired' using errcode = '22023';
      end if;
    end if;
    if v_attribution_first < v_binding_effective
       or (
         coalesce((v_schedule_definition#>>'{customerAttribution,requiresActiveManagement}')::boolean,false)
         and coalesce((v_entry#>>'{attributionSnapshot,activeManagementConfirmed}')::boolean,false) = false
       ) then
      raise exception 'attribution snapshot does not satisfy binding schedule' using errcode = '22023';
    end if;
  end if;

  v_expected_before := private.research_program_commission_total(
    v_schedule_definition, v_current_basis, v_term_mode
  );
  v_expected_after := private.research_program_commission_total(
    v_schedule_definition, v_cumulative_basis, v_term_mode
  );
  if v_current_commission <> v_expected_before
     or v_cumulative_commission <> v_expected_after
     or v_commission_delta <> v_expected_after - v_expected_before then
    raise exception 'commission delta does not match exact schedule calculation'
      using errcode = '22023';
  end if;

  if v_event_kind = 'accrual' then
    if v_reverses_id is not null or v_original_ref is distinct from v_settlement_ref
       or v_basis_delta <= 0 or v_commission_delta < 0
       or pg_catalog.jsonb_typeof(v_entry->'revenueSnapshot') is distinct from 'object'
       or v_entry->'reversalAllocationSnapshot' is distinct from 'null'::jsonb
       or v_entry->'reversalAuthorityReference' is distinct from 'null'::jsonb
       or v_entry->>'initialState' is distinct from 'pending' then
      raise exception 'invalid accrual snapshot' using errcode = '22023';
    end if;
    v_revenue_basis := private.research_program_commission_revenue_basis(
      v_entry->'revenueSnapshot', v_amount
    );
    if v_revenue_basis <> v_basis_delta then
      raise exception 'accrual basis does not match collected eligible cash' using errcode = '22023';
    end if;
  else
    select original.revenue_snapshot, original.occurred_at
      into v_original_revenue, v_original_occurred
    from public.research_commission_ledger original
    where original.id = v_reverses_id and original.event_kind = 'accrual'
      and original.original_settlement_reference = v_original_ref
      and original.partner_id = v_partner_id and original.program_binding_id = v_binding_id
      and original.program_id = v_program_id
      and original.schedule_version = v_schedule_version
      and original.schedule_hash = v_schedule_hash and original.order_id = v_order_id
      and original.canonical_order_reference = v_entry->>'orderId'
      and original.period_key = v_period_key and original.period_index = v_period_index
      and original.term_mode = v_term_mode
      and original.entry_snapshot->'period' = v_entry->'period'
      and original.schedule_snapshot = v_entry->'scheduleSnapshot'
      and original.attribution_snapshot = v_entry->'attributionSnapshot'
      and original.binding_authority_reference = v_entry->>'bindingAuthorityReference'
      and original.price_authority_reference = v_entry->>'priceAuthorityReference';
    if not found or v_original_revenue is null
       or v_reverses_id is null or v_original_ref = v_settlement_ref
       or v_occurred_at < v_original_occurred
       or v_basis_delta >= 0 or v_commission_delta > 0
       or v_entry->'revenueSnapshot' is distinct from 'null'::jsonb
       or pg_catalog.jsonb_typeof(v_entry->'reversalAllocationSnapshot') is distinct from 'object'
       or coalesce(pg_catalog.length(pg_catalog.btrim(
         v_entry->>'reversalAuthorityReference'
       )),0) < 3
       or v_entry->>'initialState' is distinct from 'reversed' then
      raise exception 'invalid reversal snapshot' using errcode = '22023';
    end if;
    perform private.research_program_commission_validate_reversal(
      v_entry->'reversalAllocationSnapshot', v_amount, -v_basis_delta, v_original_revenue
    );
    select coalesce(pg_catalog.sum(eligible_basis_delta_cents),0) into v_outstanding_basis
    from public.research_commission_ledger
    where original_settlement_reference = v_original_ref and program_id is not null;
    if v_outstanding_basis < -v_basis_delta then
      raise exception 'reversal exceeds original outstanding eligible basis' using errcode = '22023';
    end if;
  end if;

  v_basis_points := case when pg_catalog.abs(v_basis_delta) = 0 then 0
    when (
      pg_catalog.abs(v_commission_delta)::numeric * 10000 /
        pg_catalog.abs(v_basis_delta)::numeric
    ) > 10000
      then 10000
    else pg_catalog.floor(
      pg_catalog.abs(v_commission_delta)::numeric * 10000 /
        pg_catalog.abs(v_basis_delta)::numeric
    )::integer
  end;
  insert into public.research_commission_ledger(
    id, partner_id, order_id, state, eligible_net_cents, basis_points, amount_cents,
    reverses_ledger_id, source_reference, actor_type, kind,
    program_id, schedule_version, schedule_hash, schedule_snapshot, program_binding_id,
    canonical_order_reference, original_settlement_reference, settlement_reference,
    idempotency_key, operation_fingerprint, event_kind, period_key, period_index,
    term_mode, eligible_basis_delta_cents, commission_delta_cents,
    binding_authority_reference, price_authority_reference, attribution_snapshot,
    money_evidence_snapshot, revenue_snapshot, calculation_snapshot,
    reversal_authority_reference, reversal_allocation_snapshot, entry_snapshot, occurred_at
  ) values (
    v_entry_id, v_partner_id, v_order_id, v_entry->>'initialState', pg_catalog.abs(v_basis_delta),
    v_basis_points, pg_catalog.abs(v_commission_delta), v_reverses_id, v_settlement_ref, 'system',
    case when v_event_kind = 'accrual' then 'accrual' else 'reversal' end,
    v_program_id, v_schedule_version, v_schedule_hash, v_entry->'scheduleSnapshot', v_binding_id,
    v_entry->>'orderId', v_original_ref, v_settlement_ref, v_key, v_fingerprint, v_event_kind,
    v_period_key, v_period_index, v_term_mode, v_basis_delta, v_commission_delta,
    v_entry->>'bindingAuthorityReference', v_entry->>'priceAuthorityReference',
    v_entry->'attributionSnapshot', v_entry->'moneyEvidence',
    nullif(v_entry->'revenueSnapshot','null'::jsonb),
    v_entry->'calculation', nullif(v_entry->>'reversalAuthorityReference',''),
    nullif(v_entry->'reversalAllocationSnapshot','null'::jsonb), v_entry, v_occurred_at
  );
  insert into public.research_commission_period_ledger(
    id, period_key, revision, source_ledger_id, eligible_basis_delta_cents,
    commission_delta_cents, cumulative_eligible_basis_cents,
    cumulative_commission_cents, event_snapshot, occurred_at
  ) values (
    v_period_id, v_period_key, v_current_revision + 1, v_entry_id, v_basis_delta,
    v_commission_delta, v_cumulative_basis, v_cumulative_commission, v_period, v_occurred_at
  );
  return pg_catalog.jsonb_build_object('status','committed','entryId',v_entry_id);
end;
$$;

create or replace function private.research_program_commission_transition(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger_id uuid;
  v_event_id uuid;
  v_expected integer;
  v_current_sequence integer := 0;
  v_current_state text;
  v_last_occurred timestamptz;
  v_event_state text;
  v_event_occurred timestamptz;
  v_occurred_at timestamptz;
  v_key text;
  v_fingerprint text;
  v_event jsonb;
  v_existing record;
begin
  if p_command is null or pg_catalog.jsonb_typeof(p_command) is distinct from 'object'
     or not (p_command ?& array[
       'ledgerId','expectedSequence','fromState','toState','authorityReference',
       'paymentEvidenceReference','occurredAt','idempotencyKey'
     ])
     or pg_catalog.jsonb_typeof(p_command->'ledgerId') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_command->'expectedSequence') is distinct from 'number'
     or pg_catalog.jsonb_typeof(p_command->'fromState') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_command->'toState') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_command->'authorityReference') is distinct from 'string'
     or coalesce(
       pg_catalog.jsonb_typeof(p_command->'paymentEvidenceReference') in ('string','null'),
       false
     ) = false
     or pg_catalog.jsonb_typeof(p_command->'occurredAt') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_command->'idempotencyKey') is distinct from 'string' then
    raise exception 'invalid commission transition command' using errcode = '22023';
  end if;
  v_ledger_id := (p_command->>'ledgerId')::uuid;
  v_expected := (p_command->>'expectedSequence')::integer;
  v_occurred_at := (p_command->>'occurredAt')::timestamptz;
  v_key := p_command->>'idempotencyKey';
  v_fingerprint := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(p_command::text,'UTF8'),'sha256'),
    'hex'
  );
  if v_ledger_id is null or v_expected is null or v_occurred_at is null or v_expected < 0
     or coalesce(pg_catalog.length(pg_catalog.btrim(v_key)),0) < 3
     or coalesce(pg_catalog.length(pg_catalog.btrim(p_command->>'authorityReference')),0) < 3
     or coalesce(p_command->>'fromState' in (
       'pending','held','approved','payable','paid','reversed','disputed'
     ),false) = false
     or coalesce(p_command->>'toState' in (
       'pending','held','approved','payable','paid','reversed','disputed'
     ),false) = false then
    raise exception 'invalid commission transition evidence' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commission-state-idempotency:' || v_key, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commission-state:' || v_ledger_id::text, 0)
  );
  select id, operation_fingerprint, event_snapshot into v_existing
  from public.research_commission_state_events where idempotency_key = v_key;
  if found then
    return pg_catalog.jsonb_build_object(
      'status', case when v_existing.operation_fingerprint = v_fingerprint
        then 'replayed' else 'idempotency_conflict' end,
      'event', v_existing.event_snapshot
    );
  end if;
  select state, occurred_at into v_current_state, v_last_occurred
  from public.research_commission_ledger
  where id = v_ledger_id and program_id is not null;
  if not found then
    raise exception 'program commission ledger entry does not exist' using errcode = '23503';
  end if;
  select sequence, to_state, occurred_at into v_current_sequence, v_event_state, v_event_occurred
  from public.research_commission_state_events
  where ledger_id = v_ledger_id order by sequence desc limit 1 for update;
  if not found then
    v_current_sequence := 0;
  else
    v_current_state := v_event_state;
    v_last_occurred := v_event_occurred;
  end if;
  if v_expected is distinct from v_current_sequence
     or p_command->>'fromState' is distinct from v_current_state then
    return pg_catalog.jsonb_build_object('status','state_contention','event',null);
  end if;
  if v_occurred_at < v_last_occurred then
    raise exception 'commission transition cannot precede current state evidence' using errcode = '22023';
  end if;
  if not (
    (v_current_state = 'pending' and p_command->>'toState' in ('held','approved','disputed','reversed'))
    or (v_current_state = 'held' and p_command->>'toState' in ('approved','disputed','reversed'))
    or (v_current_state = 'approved' and p_command->>'toState' in ('payable','disputed','reversed'))
    or (v_current_state = 'payable' and p_command->>'toState' in ('paid','disputed','reversed'))
    or (v_current_state = 'paid' and p_command->>'toState' in ('disputed','reversed'))
    or (v_current_state = 'disputed' and p_command->>'toState' in ('held','approved','reversed'))
  ) or (
    p_command->>'toState' = 'paid'
    and coalesce(pg_catalog.length(pg_catalog.btrim(p_command->>'paymentEvidenceReference')),0) < 3
  ) then
    raise exception 'illegal commission state transition' using errcode = '22023';
  end if;

  v_event_id := pg_catalog.gen_random_uuid();
  v_event := pg_catalog.jsonb_build_object(
    'eventId',v_event_id,'ledgerId',v_ledger_id,'sequence',v_current_sequence + 1,
    'fromState',v_current_state,'toState',p_command->>'toState',
    'authorityReference',p_command->>'authorityReference',
    'paymentEvidenceReference',p_command->'paymentEvidenceReference',
    'occurredAt',p_command->>'occurredAt','idempotencyKey',v_key
  );
  insert into public.research_commission_state_events(
    id, ledger_id, sequence, from_state, to_state, authority_reference,
    payment_evidence_reference, occurred_at, idempotency_key, operation_fingerprint, event_snapshot
  ) values (
    v_event_id, v_ledger_id, v_current_sequence + 1, v_current_state,
    p_command->>'toState', p_command->>'authorityReference',
    nullif(p_command->>'paymentEvidenceReference',''), v_occurred_at, v_key, v_fingerprint, v_event
  );
  return pg_catalog.jsonb_build_object('status','committed','event',v_event);
end;
$$;

create or replace function public.research_program_commission_bind(p_command jsonb)
returns jsonb language sql set search_path = ''
as $$ select private.research_program_commission_bind(p_command) $$;
create or replace function public.research_program_commission_terminate_binding(p_command jsonb)
returns jsonb language sql set search_path = ''
as $$ select private.research_program_commission_terminate_binding(p_command) $$;
create or replace function public.research_program_commission_commit(
  p_operation jsonb, p_expected_period_revision integer
)
returns jsonb language sql set search_path = ''
as $$ select private.research_program_commission_commit(p_operation, p_expected_period_revision) $$;
create or replace function public.research_program_commission_transition(p_command jsonb)
returns jsonb language sql set search_path = ''
as $$ select private.research_program_commission_transition(p_command) $$;

alter table public.research_commission_program_schedules enable row level security;
alter table public.research_commission_program_schedules force row level security;
alter table public.research_partner_commission_program_bindings enable row level security;
alter table public.research_partner_commission_program_bindings force row level security;
alter table public.research_partner_commission_program_binding_events enable row level security;
alter table public.research_partner_commission_program_binding_events force row level security;
alter table public.research_commission_period_ledger enable row level security;
alter table public.research_commission_period_ledger force row level security;
alter table public.research_commission_state_events enable row level security;
alter table public.research_commission_state_events force row level security;

revoke all on table public.research_commission_program_schedules,
  public.research_partner_commission_program_bindings,
  public.research_partner_commission_program_binding_events,
  public.research_commission_period_ledger,
  public.research_commission_state_events
  from public, anon, authenticated, service_role;
grant select on table public.research_commission_program_schedules,
  public.research_partner_commission_program_bindings,
  public.research_partner_commission_program_binding_events,
  public.research_commission_period_ledger,
  public.research_commission_state_events to service_role;

revoke all on table public.research_commission_ledger
  from public, anon, authenticated, service_role;
grant select, insert on table public.research_commission_ledger to service_role;

revoke all on function private.research_program_commission_append_only(),
  private.research_program_commission_insert_guard(),
  private.research_program_commission_canonical_json(jsonb),
  private.research_program_commission_total(jsonb,bigint,text),
  private.research_program_commission_revenue_basis(jsonb,bigint),
  private.research_program_commission_validate_reversal(jsonb,bigint,bigint,jsonb),
  private.research_program_commission_bind(jsonb),
  private.research_program_commission_terminate_binding(jsonb),
  private.research_program_commission_commit(jsonb,integer),
  private.research_program_commission_transition(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.research_program_commission_bind(jsonb),
  public.research_program_commission_terminate_binding(jsonb),
  public.research_program_commission_commit(jsonb,integer),
  public.research_program_commission_transition(jsonb)
  from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant execute on function private.research_program_commission_bind(jsonb),
  private.research_program_commission_terminate_binding(jsonb),
  private.research_program_commission_commit(jsonb,integer),
  private.research_program_commission_transition(jsonb),
  public.research_program_commission_bind(jsonb),
  public.research_program_commission_terminate_binding(jsonb),
  public.research_program_commission_commit(jsonb,integer),
  public.research_program_commission_transition(jsonb)
  to service_role;

commit;
