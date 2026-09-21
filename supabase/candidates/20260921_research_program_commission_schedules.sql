-- Xenios Research program-specific commission authority and ledger metadata.
-- CANDIDATE ONLY; NOT APPLIED. Founder approval, migration-DAG registration,
-- exact-SHA deployment authority, precheck, postcheck, and rollback rehearsal
-- are required before any production write.
--
-- This extends the canonical research_partners and research_commission_ledger
-- authorities. It does not create a parallel partner, order, money, or payout
-- system. No partner binding is seeded, so this candidate activates nobody.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $commission_program_preflight$
begin
  if to_regclass('public.research_partners') is null
     or to_regclass('public.research_commission_ledger') is null then
    raise exception 'program commissions require canonical partner and commission authorities'
      using errcode = '55000';
  end if;
  if to_regprocedure('public.research_ledger_is_append_only()') is null then
    raise exception 'program commissions require the canonical append-only ledger trigger function'
      using errcode = '55000';
  end if;
end;
$commission_program_preflight$;

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
  '57616b61ae3c654f6154aa69896861428859033dd75d5b2224203cd1cfe47b3b',
  $seth${"schemaVersion":1,"programId":"seth_operating_advisor_2026_09_signed","version":1,"label":"Seth operating advisor signed schedule","effectiveDate":"2026-09-02","currency":"USD","eligibleBasis":"eligible_net_collected_product_channel_revenue","initialTermDays":90,"measurementPeriod":{"anchor":"binding_effective_at","days":30},"ratePolicy":{"kind":"marginal_period","bands":[{"throughCents":5000000,"rateBasisPoints":2500},{"throughCents":null,"rateBasisPoints":3000}]},"postTermTailRatePolicy":{"kind":"flat","rateBasisPoints":2500},"customerAttribution":{"startsAt":"first_eligible_transaction","durationMonths":12,"requiresAcceptedRelationship":true,"requiresActiveManagement":true},"reconciliation":{"cadence":"day_15_and_day_30","statementDays":[15,30],"payWithinBusinessDays":5},"phaseOneGuarantee":{"periodIndex":0,"minimumCents":500000,"treatment":"greater_of_commission_or_nonrecoverable_guarantee"},"exclusions":["refund","chargeback","discount","credit","tax","shipping_pass_through","complimentary_value","fraud_or_duplicate","clinical_professional_fee","patient_referral","medication_or_pharmacy_revenue","laboratory_revenue","prescription_revenue","care_clinical_charge","other_written_exclusion"],"sponsorOverridesEnabled":false,"recruiterOverridesEnabled":false,"downlineOverridesEnabled":false,"compensationForRecruitingEnabled":false,"pricingAuthority":{"serverApprovalRequired":true,"floorsCeilingsAndMarginRulesApply":true},"sourceEvidence":[{"file":"SIGNED_XENIOS_SETH_90_DAY_OPERATING_ADVISOR_AGREEMENT_REVISED (1).pdf","sha256":"09318a530d989ce3b1da2b0c24827b604d4e7958f716d6c9f368149f4382d911","location":"Sections 3.1-3.7; Sections 2.3-2.4; signature page","authority":"signed_agreement"}]}$seth$::jsonb,
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
  ) then
    raise exception 'existing schedule row differs from the exact reviewed v1 definition or hash'
      using errcode = '55000';
  end if;
end;
$commission_program_seed_guard$;

create table if not exists public.research_partner_commission_program_bindings (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.research_partners(id) on delete restrict,
  program_id text not null,
  schedule_version integer not null,
  schedule_hash text not null,
  effective_at timestamptz not null,
  ends_at timestamptz,
  authority_reference text not null check (length(btrim(authority_reference)) >= 3),
  recorded_at timestamptz not null default now(),
  recorded_by text not null check (length(btrim(recorded_by)) >= 3),
  foreign key (program_id, schedule_version, schedule_hash)
    references public.research_commission_program_schedules(
      program_id, schedule_version, schedule_hash
    ) on delete restrict,
  check (ends_at is null or ends_at > effective_at)
);
create index if not exists research_partner_commission_bindings_resolution_idx
  on public.research_partner_commission_program_bindings(partner_id, effective_at, ends_at);
create unique index if not exists research_partner_commission_one_open_binding_idx
  on public.research_partner_commission_program_bindings(partner_id)
  where ends_at is null;

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
  add column if not exists event_kind text,
  add column if not exists period_key text,
  add column if not exists period_index integer,
  add column if not exists term_mode text,
  add column if not exists eligible_basis_delta_cents bigint,
  add column if not exists commission_delta_cents bigint,
  add column if not exists price_authority_reference text,
  add column if not exists attribution_snapshot jsonb,
  add column if not exists money_evidence_snapshot jsonb,
  add column if not exists revenue_snapshot jsonb,
  add column if not exists calculation_snapshot jsonb,
  add column if not exists reversal_authority_reference text;

do $commission_program_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_commission_program_schedule_fk'
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
    select 1 from pg_constraint
    where conname = 'research_commission_program_binding_fk'
      and conrelid = 'public.research_commission_ledger'::regclass
  ) then
    alter table public.research_commission_ledger
      add constraint research_commission_program_binding_fk
      foreign key (program_binding_id)
      references public.research_partner_commission_program_bindings(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_commission_program_metadata_complete'
      and conrelid = 'public.research_commission_ledger'::regclass
  ) then
    alter table public.research_commission_ledger
      add constraint research_commission_program_metadata_complete check (
        (program_id is null and schedule_version is null and schedule_hash is null
          and schedule_snapshot is null and program_binding_id is null
          and canonical_order_reference is null
          and original_settlement_reference is null and settlement_reference is null
          and idempotency_key is null and event_kind is null and period_key is null
          and period_index is null and term_mode is null
          and eligible_basis_delta_cents is null and commission_delta_cents is null
          and price_authority_reference is null and attribution_snapshot is null
          and money_evidence_snapshot is null and revenue_snapshot is null
          and calculation_snapshot is null and reversal_authority_reference is null)
        or
        (program_id is not null and schedule_version is not null and schedule_hash is not null
          and schedule_snapshot is not null and program_binding_id is not null
          and canonical_order_reference is not null
          and length(btrim(canonical_order_reference)) >= 3
          and original_settlement_reference is not null
          and settlement_reference is not null and idempotency_key is not null
          and event_kind in ('accrual','refund_reversal','chargeback_reversal')
          and period_key is not null and period_index >= 0
          and term_mode in ('initial_term','post_term_tail')
          and eligible_basis_delta_cents is not null
          and commission_delta_cents is not null
          and price_authority_reference is not null
          and attribution_snapshot is not null
          and jsonb_typeof(attribution_snapshot) = 'object'
          and money_evidence_snapshot is not null
          and jsonb_typeof(money_evidence_snapshot) = 'object'
          and calculation_snapshot is not null
          and jsonb_typeof(calculation_snapshot) = 'object'
          and coalesce(schedule_snapshot->>'scheduleHash' = schedule_hash, false)
          and coalesce(schedule_snapshot#>>'{definition,programId}' = program_id, false)
          and coalesce((schedule_snapshot#>>'{definition,version}')::integer = schedule_version, false)
          and coalesce(money_evidence_snapshot->>'settlementRef' = settlement_reference, false)
          and coalesce(money_evidence_snapshot->>'currency' = 'USD', false)
          and length(btrim(coalesce(
            attribution_snapshot->>'acceptedRelationshipReference', ''
          ))) >= 3
          and coalesce(
            (attribution_snapshot->>'firstEligibleTransactionAt')::timestamptz is not null,
            false
          )
          and jsonb_typeof(attribution_snapshot->'activeManagementConfirmed') = 'boolean'
          and (
            (event_kind = 'accrual'
              and original_settlement_reference = settlement_reference
              and eligible_basis_delta_cents > 0 and commission_delta_cents >= 0
              and revenue_snapshot is not null
              and jsonb_typeof(revenue_snapshot) = 'object'
              and reversal_authority_reference is null)
            or
            (event_kind in ('refund_reversal','chargeback_reversal')
              and original_settlement_reference <> settlement_reference
              and eligible_basis_delta_cents < 0 and commission_delta_cents <= 0
              and revenue_snapshot is null
              and reversal_authority_reference is not null)
          ))
      );
  end if;
end;
$commission_program_constraints$;

create unique index if not exists research_commission_program_idempotency_idx
  on public.research_commission_ledger(idempotency_key) where idempotency_key is not null;
create unique index if not exists research_commission_program_money_evidence_idx
  on public.research_commission_ledger(settlement_reference) where settlement_reference is not null;
create index if not exists research_commission_program_period_idx
  on public.research_commission_ledger(period_key, created_at) where period_key is not null;
create index if not exists research_commission_canonical_order_reference_idx
  on public.research_commission_ledger(canonical_order_reference, created_at)
  where canonical_order_reference is not null;

create table if not exists public.research_commission_period_ledger (
  id uuid primary key default gen_random_uuid(),
  period_key text not null,
  revision integer not null check (revision > 0),
  source_ledger_id uuid not null unique
    references public.research_commission_ledger(id) on delete restrict,
  eligible_basis_delta_cents bigint not null,
  commission_delta_cents bigint not null,
  cumulative_eligible_basis_cents bigint not null check (cumulative_eligible_basis_cents >= 0),
  cumulative_commission_cents bigint not null check (cumulative_commission_cents >= 0),
  occurred_at timestamptz not null,
  unique (period_key, revision)
);

create table if not exists public.research_commission_state_events (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.research_commission_ledger(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  from_state text not null check (from_state in ('pending','held','approved','payable','paid','reversed','disputed')),
  to_state text not null check (to_state in ('pending','held','approved','payable','paid','reversed','disputed')),
  authority_reference text not null check (length(btrim(authority_reference)) >= 3),
  payment_evidence_reference text,
  occurred_at timestamptz not null,
  unique (ledger_id, sequence),
  check (to_state <> 'paid' or length(btrim(payment_evidence_reference)) >= 3)
);

create or replace function public.research_program_commission_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'commission authority %.% is append-only', tg_table_schema, tg_table_name
    using errcode = '55000';
end;
$$;
revoke all on function public.research_program_commission_append_only()
  from public, anon, authenticated;

drop trigger if exists research_commission_program_schedules_no_update
  on public.research_commission_program_schedules;
create trigger research_commission_program_schedules_no_update
  before update or delete on public.research_commission_program_schedules
  for each row execute function public.research_program_commission_append_only();
drop trigger if exists research_partner_commission_bindings_no_update
  on public.research_partner_commission_program_bindings;
create trigger research_partner_commission_bindings_no_update
  before update or delete on public.research_partner_commission_program_bindings
  for each row execute function public.research_program_commission_append_only();
drop trigger if exists research_commission_period_ledger_no_update
  on public.research_commission_period_ledger;
create trigger research_commission_period_ledger_no_update
  before update or delete on public.research_commission_period_ledger
  for each row execute function public.research_program_commission_append_only();
drop trigger if exists research_commission_state_events_no_update
  on public.research_commission_state_events;
create trigger research_commission_state_events_no_update
  before update or delete on public.research_commission_state_events
  for each row execute function public.research_program_commission_append_only();

alter table public.research_commission_program_schedules enable row level security;
alter table public.research_commission_program_schedules force row level security;
alter table public.research_partner_commission_program_bindings enable row level security;
alter table public.research_partner_commission_program_bindings force row level security;
alter table public.research_commission_period_ledger enable row level security;
alter table public.research_commission_period_ledger force row level security;
alter table public.research_commission_state_events enable row level security;
alter table public.research_commission_state_events force row level security;

revoke all on public.research_commission_program_schedules,
  public.research_partner_commission_program_bindings,
  public.research_commission_period_ledger,
  public.research_commission_state_events
  from public, anon, authenticated;

commit;
