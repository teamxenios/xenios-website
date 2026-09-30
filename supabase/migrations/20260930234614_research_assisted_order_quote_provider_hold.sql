-- Source-only HL-12 provider-authority hold. Do not apply to managed projects
-- without separate exact-SHA approval. Predecessor: 20260930230541.
-- Provider adapter types are not durable authenticated payment authority.
-- Unlike the original foundation header, this file makes no claim that its
-- predecessor still uses the earlier blanket paid hold: manual verification
-- remains governed by the accepted-quote and independently verified evidence path.
-- No attempt store, provider activation, historical backfill, grant or email.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if pg_catalog.to_regprocedure('public.research_assisted_order_payment_correct_manual(uuid,uuid,uuid,uuid,text,bigint,text,text,timestamptz,text)') is null
     or pg_catalog.to_regprocedure('public.research_assisted_order_financial_state(uuid)') is null
     or not exists (
       select 1 from pg_catalog.pg_attribute
       where attrelid = pg_catalog.to_regclass('public.research_assisted_order_payment_observations')
         and attname = 'observed_by_auth_user_id' and not attisdropped
     ) then
    raise exception 'Provider hold requires the exact corrections predecessor'
      using errcode = '55000', detail = 'ASSISTED_ORDER_PROVIDER_HOLD_PREDECESSOR_REQUIRED';
  end if;
  -- Serialize the preflight against verification writes through the old RPC.
  -- The lock is held until the replacement functions and ACL checks commit.
  lock table public.research_assisted_order_payment_verifications in share row exclusive mode;
  if exists (
    select 1 from public.research_assisted_order_payment_verifications where method = 'provider'
  ) then
    raise exception 'Existing provider verifications require explicit reconciliation before rollout'
      using errcode = '55000', detail = 'ASSISTED_ORDER_PROVIDER_VERIFICATIONS_RECONCILIATION_REQUIRED';
  end if;
end
$preflight$;

-- Also constrain writes from a predecessor RPC that was already in flight.
-- This is not an attempt/event authority and cannot activate provider payments.
create or replace function public.research_assisted_order_provider_payment_hold_guard()
returns trigger language plpgsql set search_path = '' as $guard$
begin
  if new.method = 'provider' then
    raise exception 'Provider payment authority is not ready'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_PROVIDER_AUTHORITY_NOT_READY';
  end if;
  return new;
end
$guard$;
revoke all on function public.research_assisted_order_provider_payment_hold_guard()
  from public, anon, authenticated, service_role;
drop trigger if exists hl12_provider_observation_hold on public.research_assisted_order_payment_observations;
create trigger hl12_provider_observation_hold
before insert on public.research_assisted_order_payment_observations
for each row execute function public.research_assisted_order_provider_payment_hold_guard();
drop trigger if exists hl12_provider_verification_hold on public.research_assisted_order_payment_verifications;
create trigger hl12_provider_verification_hold
before insert on public.research_assisted_order_payment_verifications
for each row execute function public.research_assisted_order_provider_payment_hold_guard();

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
  -- No provider attempt/event authority exists. Reject before lookup or replay.
  if p_method = 'provider' then
    raise exception 'Provider payment authority is not ready'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_PROVIDER_AUTHORITY_NOT_READY';
  end if;
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
  -- This also holds observations persisted by a preceding permissive function.
  -- Check before receipt replay: no existing provider row becomes authority here.
  if v_observation.method = 'provider' then
    raise exception 'Provider payment authority is not ready'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_PROVIDER_AUTHORITY_NOT_READY';
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

create or replace function public.research_assisted_order_payment_verify_bound(
  p_request_id uuid,
  p_observation_id uuid,
  p_verifier_auth_user_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $bound$
declare
  v_request_id uuid;
begin
  select request_id into v_request_id
  from public.research_assisted_order_payment_observations
  where id = p_observation_id;
  -- SQL three-valued logic must not turn a NULL request into an unbound call.
  if not found or v_request_id is distinct from p_request_id then return null; end if;
  return public.research_assisted_order_payment_verify(
    p_observation_id, p_verifier_auth_user_id);
end
$bound$;

revoke all on function public.research_assisted_order_payment_observe(uuid,uuid,text,bigint,text,text,text,timestamptz,uuid,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.research_assisted_order_payment_observe(uuid,uuid,text,bigint,text,text,text,timestamptz,uuid,text,text,text)
  to service_role;
revoke all on function public.research_assisted_order_payment_verify(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.research_assisted_order_payment_verify_bound(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.research_assisted_order_payment_verify_bound(uuid,uuid,uuid)
  to service_role;

do $postcondition$
declare v_role text;
declare v_signature text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.research_assisted_order_provider_payment_hold_guard()', 'EXECUTE') then
      raise exception 'Provider hold trigger function must remain private' using errcode = '55000';
    end if;
    if has_function_privilege(v_role, 'public.research_assisted_order_payment_verify(uuid,uuid)', 'EXECUTE') then
      raise exception 'Unbound payment verification must remain private' using errcode = '55000';
    end if;
    foreach v_signature in array array[
      'public.research_assisted_order_payment_observe(uuid,uuid,text,bigint,text,text,text,timestamptz,uuid,text,text,text)',
      'public.research_assisted_order_payment_verify_bound(uuid,uuid,uuid)'
    ] loop
      if has_function_privilege(v_role, v_signature, 'EXECUTE') is distinct from (v_role = 'service_role') then
        raise exception 'Provider-hold RPC ACL failed for % on %', v_role, v_signature using errcode = '55000';
      end if;
    end loop;
    if has_table_privilege(v_role, 'public.research_assisted_order_payment_observations', 'INSERT')
       or has_table_privilege(v_role, 'public.research_assisted_order_payment_verifications', 'INSERT') then
      raise exception 'Direct financial evidence inserts must remain private' using errcode = '55000';
    end if;
  end loop;
end
$postcondition$;
commit;
