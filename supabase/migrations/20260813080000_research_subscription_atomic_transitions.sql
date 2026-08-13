-- Canonical subscription transition concurrency hardening.
-- Prepared only: applying this managed migration is a separate release action.

alter table public.research_product_subscriptions
  add column if not exists version integer not null default 1,
  add column if not exists price_version text not null default '',
  add column if not exists shipping_address_ref text;

alter table public.research_product_subscriptions
  drop constraint if exists research_product_subscriptions_quantity_check;
alter table public.research_product_subscriptions
  add constraint research_product_subscriptions_quantity_check
  check (quantity between 1 and 50) not valid;
alter table public.research_product_subscriptions
  drop constraint if exists research_product_subscriptions_version_check;
alter table public.research_product_subscriptions
  add constraint research_product_subscriptions_version_check
  check (version >= 1) not valid;

alter table public.research_subscription_events
  add column if not exists resulting_version integer,
  add column if not exists idempotency_key_hash text,
  add column if not exists intent_hash text,
  add column if not exists result_snapshot jsonb;

create unique index if not exists research_subscription_events_command_unique
  on public.research_subscription_events(subscription_id, idempotency_key_hash)
  where idempotency_key_hash is not null;

create or replace function public.research_subscription_transition_replay(
  p_subscription_id uuid,
  p_member_id uuid,
  p_idempotency_key text,
  p_intent_hash text
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prior public.research_subscription_events%rowtype;
  v_key_hash text;
begin
  if p_subscription_id is null
     or p_member_id is null
     or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 160
     or btrim(p_idempotency_key) <> p_idempotency_key
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
     or p_intent_hash !~ '^[a-f0-9]{64}$'
  then
    return null;
  end if;
  if not exists (
    select 1 from public.research_product_subscriptions
     where id=p_subscription_id and member_id=p_member_id
  ) then
    return null;
  end if;
  v_key_hash := encode(extensions.digest(convert_to(p_idempotency_key, 'UTF8'), 'sha256'), 'hex');
  select * into v_prior from public.research_subscription_events
   where subscription_id=p_subscription_id and idempotency_key_hash=v_key_hash;
  if not found then return null; end if;
  if v_prior.intent_hash is distinct from p_intent_hash then
    return jsonb_build_object('ok',false,'code','idempotency_conflict');
  end if;
  return jsonb_build_object(
    'ok',true,'replayed',true,'snapshot',v_prior.result_snapshot,
    'event',jsonb_build_object(
      'subscriptionId',p_subscription_id::text,
      'resultingVersion',v_prior.resulting_version,
      'idempotencyKey',p_idempotency_key,
      'intentHash',v_prior.intent_hash,
      'action',v_prior.action,
      'fromState',v_prior.from_state,
      'toState',v_prior.to_state,
      'actorType',v_prior.actor_type,
      'actorId',v_prior.actor_id,
      'effectiveAt',v_prior.effective_at,
      'occurredAt',v_prior.occurred_at
    )
  );
end;
$$;

create or replace function public.research_subscription_commit_transition(
  p_subscription_id uuid,
  p_member_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_intent_hash text,
  p_action text,
  p_actor_type text,
  p_actor_id text,
  p_from_state text,
  p_to_state text,
  p_effective_at timestamptz,
  p_next_snapshot jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.research_product_subscriptions%rowtype;
  v_prior public.research_subscription_events%rowtype;
  v_key_hash text;
  v_snapshot jsonb;
  v_event jsonb;
  v_quantity integer;
  v_frequency integer;
  v_next_version integer;
begin
  if p_subscription_id is null
     or p_member_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 160
     or btrim(p_idempotency_key) <> p_idempotency_key
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
     or p_intent_hash !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_next_snapshot) <> 'object'
  then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  if p_actor_type not in ('member','admin','system','provider_webhook')
     or not (
       (p_from_state='pending' and p_to_state='active' and p_action='activate' and p_actor_type in ('system','provider_webhook'))
       or (p_from_state='active' and p_to_state='paused' and p_action='pause' and p_actor_type in ('member','admin'))
       or (p_from_state='paused' and p_to_state='active' and p_action='resume' and p_actor_type in ('member','admin'))
       or (p_from_state='active' and p_to_state='skip_scheduled' and p_action='skip' and p_actor_type in ('member','admin'))
       or (p_from_state='skip_scheduled' and p_to_state='active' and p_action='resume' and p_actor_type in ('member','admin','system'))
       or (p_from_state='active' and p_to_state='rescheduled' and p_action='reschedule' and p_actor_type in ('member','admin'))
       or (p_from_state='rescheduled' and p_to_state='active' and p_action='resume' and p_actor_type in ('member','admin','system'))
       or (p_from_state='active' and p_to_state='payment_issue' and p_action='report_payment_issue' and p_actor_type in ('system','provider_webhook'))
       or (p_from_state='payment_issue' and p_to_state='active' and p_action='resolve_payment_issue' and p_actor_type in ('system','provider_webhook'))
       or (p_from_state in ('pending','active','paused','skip_scheduled','rescheduled','payment_issue') and p_to_state='cancelled' and p_action='cancel' and p_actor_type in ('member','admin','system'))
     )
  then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  begin
    v_quantity := (p_next_snapshot->>'quantity')::integer;
    v_frequency := (p_next_snapshot->>'frequencyDays')::integer;
    v_next_version := (p_next_snapshot->>'version')::integer;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end;

  if v_quantity not between 1 and 50
     or v_frequency not in (30,60,90)
     or v_next_version <> p_expected_version + 1
     or p_next_snapshot->>'subscriptionId' <> p_subscription_id::text
     or p_next_snapshot->>'memberId' <> p_member_id::text
     or p_next_snapshot->>'state' <> p_to_state
     or nullif(btrim(p_next_snapshot->>'sku'), '') is null
     or jsonb_typeof(p_next_snapshot->'priceVersion') <> 'string'
  then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  select * into v_subscription
    from public.research_product_subscriptions
   where id = p_subscription_id and member_id = p_member_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'subscription_not_found');
  end if;

  v_key_hash := encode(extensions.digest(convert_to(p_idempotency_key, 'UTF8'), 'sha256'), 'hex');
  select * into v_prior
    from public.research_subscription_events
   where subscription_id = p_subscription_id
     and idempotency_key_hash = v_key_hash;
  if found then
    if v_prior.intent_hash is distinct from p_intent_hash then
      return jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
    end if;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'snapshot', v_prior.result_snapshot,
      'event', jsonb_build_object(
        'subscriptionId', p_subscription_id::text,
        'resultingVersion', v_prior.resulting_version,
        'idempotencyKey', p_idempotency_key,
        'intentHash', v_prior.intent_hash,
        'action', v_prior.action,
        'fromState', v_prior.from_state,
        'toState', v_prior.to_state,
        'actorType', v_prior.actor_type,
        'actorId', v_prior.actor_id,
        'effectiveAt', v_prior.effective_at,
        'occurredAt', v_prior.occurred_at
      )
    );
  end if;

  if v_subscription.version <> p_expected_version or v_subscription.state <> p_from_state then
    return jsonb_build_object('ok', false, 'code', 'stale_version');
  end if;

  update public.research_product_subscriptions set
    state = p_to_state,
    frequency_days = v_frequency,
    quantity = v_quantity,
    next_charge_at = (p_next_snapshot->>'nextRenewalAt')::timestamptz,
    next_shipment_at = (p_next_snapshot->>'nextShipmentAt')::timestamptz,
    payment_reference = nullif(p_next_snapshot->>'paymentProviderReference', ''),
    price_version = p_next_snapshot->>'priceVersion',
    shipping_address_ref = nullif(p_next_snapshot->>'shippingAddressRef', ''),
    updated_at = (p_next_snapshot->>'updatedAt')::timestamptz,
    cancelled_at = (p_next_snapshot->>'cancelledAt')::timestamptz,
    version = v_next_version
  where id = p_subscription_id and member_id = p_member_id and version = p_expected_version;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'stale_version');
  end if;

  v_snapshot := p_next_snapshot;
  insert into public.research_subscription_events(
    subscription_id, action, from_state, to_state, actor_type, actor_id,
    effective_at, occurred_at, resulting_version, idempotency_key_hash,
    intent_hash, result_snapshot
  ) values (
    p_subscription_id, p_action, p_from_state, p_to_state, p_actor_type, p_actor_id,
    p_effective_at, (p_next_snapshot->>'updatedAt')::timestamptz, v_next_version,
    v_key_hash, p_intent_hash, v_snapshot
  ) returning jsonb_build_object(
    'subscriptionId', subscription_id::text,
    'resultingVersion', resulting_version,
    'idempotencyKey', p_idempotency_key,
    'intentHash', intent_hash,
    'action', action,
    'fromState', from_state,
    'toState', to_state,
    'actorType', actor_type,
    'actorId', actor_id,
    'effectiveAt', effective_at,
    'occurredAt', occurred_at
  ) into v_event;

  return jsonb_build_object(
    'ok', true,
    'replayed', false,
    'snapshot', v_snapshot,
    'event', v_event
  );
end;
$$;

revoke all on function public.research_subscription_commit_transition(
  uuid,uuid,integer,text,text,text,text,text,text,text,timestamptz,jsonb
) from public, anon, authenticated;
grant execute on function public.research_subscription_commit_transition(
  uuid,uuid,integer,text,text,text,text,text,text,text,timestamptz,jsonb
) to service_role;

revoke all on function public.research_subscription_transition_replay(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.research_subscription_transition_replay(uuid,uuid,text,text)
  to service_role;

comment on function public.research_subscription_commit_transition(
  uuid,uuid,integer,text,text,text,text,text,text,text,timestamptz,jsonb
) is 'Atomically commits one versioned subscription transition and its replayable append-only event.';
