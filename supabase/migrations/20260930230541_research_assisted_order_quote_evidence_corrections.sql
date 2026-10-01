-- Local/source-only HL-12: append-only correction, durable single-use evidence,
-- cancellation hold and independently readable financial eligibility.
-- No grant, historical verification backfill, provider configuration or refund.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Refuse ambiguous existing evidence instead of silently choosing its owner.
do $preflight$
begin
  if exists (
    select 1 from public.research_assisted_order_payment_observations
    group by method, coalesce(provider_name, ''), btrim(source_evidence_ref)
    having count(distinct request_id) > 1
  ) then
    raise exception 'Payment evidence is assigned to multiple requests; reconcile before migration'
      using errcode = '55000';
  end if;
end
$preflight$;

create table if not exists public.research_assisted_order_evidence_claims (
  method text not null check (method in ('manual', 'provider')),
  provider_namespace text not null,
  evidence_ref text not null check (length(btrim(evidence_ref)) between 3 and 255),
  request_id uuid not null references public.research_assisted_order_requests(id),
  claimed_at timestamptz not null default now(),
  primary key (method, provider_namespace, evidence_ref)
);
insert into public.research_assisted_order_evidence_claims
  (method, provider_namespace, evidence_ref, request_id)
select distinct method, coalesce(provider_name, ''), btrim(source_evidence_ref), request_id
from public.research_assisted_order_payment_observations
on conflict do nothing;

create table if not exists public.research_assisted_order_observation_corrections (
  observation_id uuid primary key references public.research_assisted_order_payment_observations(id),
  replacement_id uuid not null unique references public.research_assisted_order_payment_observations(id)
    deferrable initially deferred,
  reason text not null check (length(btrim(reason)) between 3 and 1000),
  corrected_by uuid not null,
  corrected_at timestamptz not null default now(),
  check (observation_id <> replacement_id)
);

alter table public.research_assisted_order_evidence_claims enable row level security;
alter table public.research_assisted_order_evidence_claims force row level security;
alter table public.research_assisted_order_observation_corrections enable row level security;
alter table public.research_assisted_order_observation_corrections force row level security;
revoke all on public.research_assisted_order_evidence_claims,
  public.research_assisted_order_observation_corrections from public, anon, authenticated, service_role;

drop trigger if exists hl12_claim_immutable on public.research_assisted_order_evidence_claims;
create trigger hl12_claim_immutable before update or delete on public.research_assisted_order_evidence_claims
for each row execute function public.research_assisted_order_financial_block_mutation();
drop trigger if exists hl12_correction_immutable on public.research_assisted_order_observation_corrections;
create trigger hl12_correction_immutable before update or delete on public.research_assisted_order_observation_corrections
for each row execute function public.research_assisted_order_financial_block_mutation();

-- Request-reference identity is not bank-transaction identity. Keep old rows,
-- but permit a replacement only after a governed correction retires the old one.
alter table public.research_assisted_order_payment_observations
  drop constraint if exists research_assisted_order_observation_payment_uq;
create index if not exists hl12_observation_reference_idx
  on public.research_assisted_order_payment_observations(method, payment_reference);
-- Do not infer UUIDs for old labels. Historical observations without this
-- binding remain held for explicit reconciliation rather than guessed backfill.
alter table public.research_assisted_order_payment_observations
  add column if not exists observed_by_auth_user_id uuid;
create or replace function public.research_assisted_order_evidence_claim_guard()
returns trigger language plpgsql set search_path = '' as $guard$
declare v_owner uuid;
begin
  perform 1 from public.research_assisted_order_requests where id = new.request_id for update;
  if exists (select 1 from public.research_assisted_order_requests where id = new.request_id
    and status not in ('reviewing', 'payment_pending', 'payment_review')) then
    raise exception 'New observations require an open payment-review workflow'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_PAYMENT_REVIEW_REQUIRED';
  end if;
  if new.method = 'manual' and not exists (
    select 1 from public.research_assisted_order_payment_verifier_grants
    where auth_user_id = new.observed_by_auth_user_id and revoked_at is null
      and actor_label = new.observed_by
  ) then
    raise exception 'Manual observation requires an immutable actor UUID binding'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_MANUAL_VERIFIER_REQUIRED';
  end if;
  if exists (select 1 from public.research_assisted_order_payment_observations o
    where o.method = new.method and o.payment_reference = new.payment_reference
      and not exists (select 1 from public.research_assisted_order_observation_corrections c
        where c.observation_id = o.id)) then
    raise exception 'An active observation already holds this reference'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_PAYMENT_REFERENCE_REUSED';
  end if;
  insert into public.research_assisted_order_evidence_claims
    (method, provider_namespace, evidence_ref, request_id)
  values (new.method, coalesce(new.provider_name, ''), btrim(new.source_evidence_ref), new.request_id)
  on conflict do nothing;
  select request_id into v_owner from public.research_assisted_order_evidence_claims
  where method = new.method and provider_namespace = coalesce(new.provider_name, '')
    and evidence_ref = btrim(new.source_evidence_ref);
  if v_owner is distinct from new.request_id then
    raise exception 'External evidence is already assigned to another request'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_PAYMENT_EVIDENCE_REUSED';
  end if;
  return new;
end
$guard$;
drop trigger if exists hl12_evidence_claim on public.research_assisted_order_payment_observations;
create trigger hl12_evidence_claim before insert on public.research_assisted_order_payment_observations
for each row execute function public.research_assisted_order_evidence_claim_guard();

create or replace function public.research_assisted_order_correction_verification_guard()
returns trigger language plpgsql set search_path = '' as $guard$
begin
  perform 1 from public.research_assisted_order_requests where id = new.request_id for update;
  if exists (select 1 from public.research_assisted_order_observation_corrections
    where observation_id = new.observation_id) then
    raise exception 'Superseded observations cannot verify payment'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_OBSERVATION_SUPERSEDED';
  end if;
  return new;
end
$guard$;
drop trigger if exists hl12_correction_verification on public.research_assisted_order_payment_verifications;
create trigger hl12_correction_verification before insert on public.research_assisted_order_payment_verifications
for each row execute function public.research_assisted_order_correction_verification_guard();

create or replace function public.research_assisted_order_payment_observe(
  p_request_id uuid,
  p_quote_id uuid,
  p_method text,
  p_observed_amount_cents bigint,
  p_observed_currency text,
  p_payment_reference text,
  p_source_evidence_ref text,
  p_observed_at timestamptz,
  p_actor_auth_user_id uuid default null,
  p_provider_name text default null,
  p_provider_event_id text default null,
  p_provider_payment_id text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $observe$
declare
  v_actor_label text;
  v_reference text;
  v_existing public.research_assisted_order_payment_observations%rowtype;
  v_id uuid;
  v_request_reference text;
  v_provider_name text;
  v_provider_event_id text;
  v_provider_payment_id text;
begin
  select public_reference into v_request_reference
  from public.research_assisted_order_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  v_reference := nullif(pg_catalog.btrim(p_payment_reference), '');
  v_provider_name := nullif(pg_catalog.btrim(p_provider_name), '');
  v_provider_event_id := nullif(pg_catalog.btrim(p_provider_event_id), '');
  v_provider_payment_id := nullif(pg_catalog.btrim(p_provider_payment_id), '');
  if v_reference is null or p_observed_amount_cents <= 0
     or p_observed_at is null or nullif(pg_catalog.btrim(p_source_evidence_ref), '') is null then
    raise exception 'Observed payment fields are incomplete' using errcode = 'P0001';
  end if;
  if p_method = 'manual' then
    select actor_label into v_actor_label
    from public.research_assisted_order_payment_verifier_grants
    where auth_user_id = p_actor_auth_user_id and revoked_at is null;
    if not found or v_reference <> v_request_reference
       or p_provider_name is not null or p_provider_event_id is not null
       or p_provider_payment_id is not null then
      raise exception 'Manual observation requires a named grant and exact request reference'
        using errcode = 'P0001', detail = 'ASSISTED_ORDER_MANUAL_VERIFIER_REQUIRED';
    end if;
  elsif p_method = 'provider' then
    if v_provider_name is null or v_provider_event_id is null
       or v_provider_payment_id is null
       or v_reference <> v_provider_payment_id then
      raise exception 'Provider observation requires exact event and payment identity'
        using errcode = 'P0001';
    end if;
    v_actor_label := 'provider:' || v_provider_name;
  else
    raise exception 'Unknown observation method' using errcode = 'P0001';
  end if;

  select * into v_existing from public.research_assisted_order_payment_observations
  where method = p_method and payment_reference = v_reference
    and not exists (select 1 from public.research_assisted_order_observation_corrections c
      where c.observation_id = research_assisted_order_payment_observations.id);
  if found then
    if v_existing.request_id <> p_request_id or v_existing.quote_id <> p_quote_id
       or v_existing.observed_amount_cents <> p_observed_amount_cents
       or v_existing.observed_currency <> p_observed_currency
       or v_existing.source_evidence_ref <> p_source_evidence_ref
       or v_existing.observed_at <> p_observed_at
       or v_existing.provider_name is distinct from v_provider_name
       or v_existing.provider_event_id is distinct from v_provider_event_id
       or v_existing.provider_payment_id is distinct from v_provider_payment_id then
      raise exception 'Payment reference was already used for different evidence'
        using errcode = 'P0001', detail = 'ASSISTED_ORDER_PAYMENT_REFERENCE_REUSED';
    end if;
    return pg_catalog.jsonb_build_object('observationId', v_existing.id, 'replayed', true);
  end if;

  insert into public.research_assisted_order_payment_observations (
    request_id, quote_id, method, observed_amount_cents, observed_currency,
    payment_reference, provider_name, provider_event_id, provider_payment_id,
    source_evidence_ref, observed_by, observed_at, observed_by_auth_user_id
  ) values (
    p_request_id, p_quote_id, p_method, p_observed_amount_cents,
    p_observed_currency, v_reference, v_provider_name, v_provider_event_id,
    v_provider_payment_id, p_source_evidence_ref, v_actor_label, p_observed_at,
    case when p_method = 'manual' then p_actor_auth_user_id else null end
  ) returning id into v_id;
  return pg_catalog.jsonb_build_object('observationId', v_id, 'replayed', false);
end
$observe$;

-- Fix the direct-RPC nullable-boolean ownership case as well as HTTP pre-read.
create or replace function public.research_assisted_order_quote_accept(
  p_quote_id uuid,
  p_version integer,
  p_expected_total_cents bigint,
  p_member_id uuid default null,
  p_early_access_session_hash text default null,
  p_status_token_hash text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $accept$
declare
  v_request public.research_assisted_order_requests%rowtype;
  v_quote public.research_assisted_order_quotes%rowtype;
  v_request_id uuid;
  v_authorized boolean;
begin
  select request_id into v_request_id from public.research_assisted_order_quotes
  where id = p_quote_id;
  if not found then return null; end if;
  select * into v_request from public.research_assisted_order_requests
  where id = v_request_id for update;
  select * into v_quote from public.research_assisted_order_quotes
  where id = p_quote_id for update;

  v_authorized :=
    (p_member_id is not null and v_request.actor_member_id = p_member_id)
    or (p_early_access_session_hash is not null
        and v_request.early_access_session_hash = p_early_access_session_hash)
    or exists (select 1 from public.research_assisted_order_access_tokens t
      where t.request_id = v_request.id and t.token_hash = p_status_token_hash
        and t.revoked_at is null and t.expires_at > now());
  if not coalesce(v_authorized, false) then return null; end if;
  if v_quote.version is distinct from p_version or v_quote.total_cents is distinct from p_expected_total_cents
     or v_quote.currency <> 'USD' then
    raise exception 'Quote changed; refresh before accepting'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_STALE';
  end if;
  if v_quote.state = 'accepted' then
    return pg_catalog.jsonb_build_object(
      'quoteId', v_quote.id, 'version', v_quote.version,
      'totalCents', v_quote.total_cents, 'currency', v_quote.currency,
      'acceptanceId', v_quote.acceptance_id, 'acceptedAt', v_quote.accepted_at,
      'replayed', true);
  end if;
  if v_quote.state <> 'issued' or v_quote.valid_until <= now()
     or exists (select 1 from public.research_assisted_order_quotes q
                where q.request_id = v_request.id and q.version > v_quote.version) then
    raise exception 'Quote is no longer available'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_STALE';
  end if;
  update public.research_assisted_order_quotes
  set state = 'accepted', accepted_at = now(), acceptance_id = gen_random_uuid()
  where id = p_quote_id returning * into v_quote;
  return pg_catalog.jsonb_build_object(
    'quoteId', v_quote.id, 'version', v_quote.version,
    'totalCents', v_quote.total_cents, 'currency', v_quote.currency,
    'acceptanceId', v_quote.acceptance_id, 'acceptedAt', v_quote.accepted_at,
    'replayed', false);
end
$accept$;

create or replace function public.research_assisted_order_payment_correct_manual(
  p_request_id uuid, p_observation_id uuid, p_actor_auth_user_id uuid,
  p_quote_id uuid, p_payment_reference text,
  p_observed_amount_cents bigint, p_observed_currency text,
  p_source_evidence_ref text, p_observed_at timestamptz, p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $correct$
declare
  v_old public.research_assisted_order_payment_observations%rowtype;
  v_new public.research_assisted_order_payment_observations%rowtype;
  v_actor text;
  v_status text;
  v_replacement uuid;
  v_reason text;
begin
  select * into v_old from public.research_assisted_order_payment_observations
  where id = p_observation_id and request_id = p_request_id;
  if not found then return null; end if;
  if v_old.quote_id is distinct from p_quote_id or v_old.payment_reference is distinct from p_payment_reference then
    raise exception 'Correction must match the independently checked quote and reference'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_CORRECTION_CONFLICT';
  end if;
  select status into v_status from public.research_assisted_order_requests
  where id = p_request_id for update;
  select actor_label into v_actor from public.research_assisted_order_payment_verifier_grants
  where auth_user_id = p_actor_auth_user_id and revoked_at is null;
  if not found or v_old.method <> 'manual' or v_actor <> v_old.observed_by
     or v_old.observed_by_auth_user_id is distinct from p_actor_auth_user_id then
    raise exception 'A matching named finance grant is required'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_MANUAL_VERIFIER_REQUIRED';
  end if;
  select replacement_id, reason into v_replacement, v_reason
  from public.research_assisted_order_observation_corrections where observation_id = v_old.id;
  if found then
    select * into v_new from public.research_assisted_order_payment_observations where id = v_replacement;
    if v_new.observed_amount_cents is distinct from p_observed_amount_cents
      or v_new.observed_currency is distinct from p_observed_currency
      or v_new.source_evidence_ref is distinct from p_source_evidence_ref
      or v_new.observed_at is distinct from p_observed_at
      or v_reason is distinct from p_reason then
      raise exception 'Correction replay differs from its recorded evidence'
        using errcode = 'P0001', detail = 'ASSISTED_ORDER_CORRECTION_CONFLICT';
    end if;
    return jsonb_build_object('observationId', v_replacement, 'supersedes', v_old.id, 'replayed', true);
  end if;
  if v_status not in ('payment_pending', 'payment_review')
     or exists (select 1 from public.research_assisted_order_payment_verifications
       where request_id = p_request_id) then
    raise exception 'Verified or historical payment cannot be corrected as an observation'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_CORRECTION_REFUSED';
  end if;
  v_replacement := gen_random_uuid();
  insert into public.research_assisted_order_observation_corrections
    (observation_id, replacement_id, reason, corrected_by)
  values (v_old.id, v_replacement, p_reason, p_actor_auth_user_id);
  insert into public.research_assisted_order_payment_observations (
    id, request_id, quote_id, method, observed_amount_cents, observed_currency,
    payment_reference, source_evidence_ref, observed_by, observed_at, observed_by_auth_user_id
  ) values (
    v_replacement, p_request_id, v_old.quote_id, 'manual', p_observed_amount_cents,
    p_observed_currency, v_old.payment_reference, p_source_evidence_ref, v_actor, p_observed_at, p_actor_auth_user_id
  );
  return jsonb_build_object('observationId', v_replacement, 'supersedes', v_old.id, 'replayed', false);
end
$correct$;

-- Absence of payment evidence is distinct from verified payment and from an
-- unresolved observation. This service-role-only read is not a customer API.
create or replace function public.research_assisted_order_financial_state(p_request_id uuid)
returns jsonb language sql security definer set search_path = '' as $state$
  select jsonb_build_object(
    'hasObservation', exists (select 1 from public.research_assisted_order_payment_observations
      where request_id = p_request_id),
    'paymentVerified', exists (select 1 from public.research_assisted_order_payment_verifications v
      join public.research_assisted_order_quotes q on q.id = v.quote_id
      where v.request_id = p_request_id and q.request_id = p_request_id
        and q.state = 'accepted' and q.acceptance_id = v.acceptance_id
        and q.version = v.quote_version and q.total_cents = v.observed_amount_cents
        and q.currency = v.observed_currency))
  where exists (select 1 from public.research_assisted_order_requests where id = p_request_id);
$state$;

-- Used only after an existing status capability has authorized this reference.
-- Private RPC; public callers cannot use it as an existence oracle.
create or replace function public.research_assisted_order_financial_state_by_reference(p_public_reference text)
returns jsonb language sql security definer set search_path = '' as $state$
  select public.research_assisted_order_financial_state(id)
  from public.research_assisted_order_requests where public_reference = p_public_reference;
$state$;
revoke all on function public.research_assisted_order_financial_state_by_reference(text)
  from public, anon, authenticated;
grant execute on function public.research_assisted_order_financial_state_by_reference(text) to service_role;

create or replace function public.research_assisted_order_observed_cancel_guard()
returns trigger language plpgsql set search_path = '' as $guard$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled'
    and exists (select 1 from public.research_assisted_order_payment_observations
      where request_id = new.id) then
    raise exception 'Observed money requires a governed no-funds or refund resolution before cancellation'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_REFUND_AUTHORITY_NOT_READY';
  end if;
  return new;
end
$guard$;
drop trigger if exists hl12_observed_cancel on public.research_assisted_order_requests;
create trigger hl12_observed_cancel before update of status on public.research_assisted_order_requests
for each row execute function public.research_assisted_order_observed_cancel_guard();

revoke all on function public.research_assisted_order_evidence_claim_guard(),
  public.research_assisted_order_correction_verification_guard(),
  public.research_assisted_order_observed_cancel_guard() from public, anon, authenticated, service_role;
revoke all on function public.research_assisted_order_payment_correct_manual(uuid,uuid,uuid,uuid,text,bigint,text,text,timestamptz,text),
  public.research_assisted_order_financial_state(uuid) from public, anon, authenticated;
grant execute on function public.research_assisted_order_payment_correct_manual(uuid,uuid,uuid,uuid,text,bigint,text,text,timestamptz,text),
  public.research_assisted_order_financial_state(uuid) to service_role;
create or replace function public.research_assisted_order_payment_verify(
  p_observation_id uuid,
  p_verifier_auth_user_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $verify$
declare
  v_observation public.research_assisted_order_payment_observations%rowtype;
  v_request public.research_assisted_order_requests%rowtype;
  v_quote public.research_assisted_order_quotes%rowtype;
  v_verification_id uuid;
  v_verified_at timestamptz;
  v_verified_by text;
  v_actor_label text;
begin
  select * into v_observation
  from public.research_assisted_order_payment_observations
  where id = p_observation_id;
  if not found then
    raise exception 'Payment observation not found'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_OBSERVATION_NOT_FOUND';
  end if;
  select * into v_request from public.research_assisted_order_requests
  where id = v_observation.request_id for update;
  select * into v_quote from public.research_assisted_order_quotes
  where id = v_observation.quote_id;
  if v_quote.request_id <> v_request.id or v_quote.state <> 'accepted'
     or v_quote.acceptance_id is null
     or exists (select 1 from public.research_assisted_order_quotes q
                where q.request_id = v_request.id and q.version > v_quote.version) then
    raise exception 'Payment quote is stale or unaccepted'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_STALE';
  end if;
  if v_observation.method = 'manual' then
    select actor_label into v_actor_label
    from public.research_assisted_order_payment_verifier_grants
    where auth_user_id = p_verifier_auth_user_id and revoked_at is null;
    if not found or v_actor_label <> v_observation.observed_by
       or v_observation.observed_by_auth_user_id is distinct from p_verifier_auth_user_id then
      raise exception 'Manual payment verifier grant required'
        using errcode = 'P0001', detail = 'ASSISTED_ORDER_MANUAL_VERIFIER_REQUIRED';
    end if;
  else
    if p_verifier_auth_user_id is not null then
      raise exception 'Provider verification cannot claim a human actor'
        using errcode = 'P0001';
    end if;
    v_actor_label := v_observation.observed_by;
  end if;
  if v_observation.observed_amount_cents <> v_quote.total_cents
     or v_observation.observed_currency <> v_quote.currency then
    raise exception 'Payment amount or currency does not match the accepted quote'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_PAYMENT_AMOUNT_CURRENCY_MISMATCH';
  end if;
  select id, verified_at, verified_by into v_verification_id, v_verified_at, v_verified_by
  from public.research_assisted_order_payment_verifications
  where request_id = v_request.id and observation_id = p_observation_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'verificationId', v_verification_id, 'requestId', v_request.id,
      'state', v_request.status, 'verifiedAt', v_verified_at, 'verifiedBy', v_verified_by, 'replayed', true);
  end if;
  if v_request.status <> 'payment_review' then
    raise exception 'Request is not in payment review'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_PAYMENT_REVIEW_REQUIRED';
  end if;
  insert into public.research_assisted_order_payment_verifications (
    request_id, quote_id, quote_version, acceptance_id, observation_id,
    expected_amount_cents, expected_currency, observed_amount_cents,
    observed_currency, payment_reference, method, provider_name,
    provider_event_id, provider_payment_id, verified_by
  ) values (
    v_request.id, v_quote.id, v_quote.version, v_quote.acceptance_id,
    v_observation.id, v_quote.total_cents, v_quote.currency,
    v_observation.observed_amount_cents, v_observation.observed_currency,
    v_observation.payment_reference, v_observation.method,
    v_observation.provider_name, v_observation.provider_event_id,
    v_observation.provider_payment_id, v_actor_label
  ) returning id, verified_at into v_verification_id, v_verified_at;

  perform public.research_assisted_order_set_status(
    v_request.id, 'payment_review', 'paid', v_actor_label,
    case when v_observation.method = 'manual' then 'admin' else 'system' end,
    'Payment verification recorded.', null,
    pg_catalog.jsonb_build_object('paymentVerificationId', v_verification_id),
    now()
  );
  return pg_catalog.jsonb_build_object(
    'verificationId', v_verification_id, 'requestId', v_request.id,
    'state', 'paid', 'verifiedAt', v_verified_at, 'verifiedBy', v_actor_label, 'replayed', false);
end
$verify$;
-- CREATE OR REPLACE preserves the already-revoked unbound function ACL.
revoke all on function public.research_assisted_order_payment_verify(uuid,uuid)
  from public, anon, authenticated, service_role;
commit;
