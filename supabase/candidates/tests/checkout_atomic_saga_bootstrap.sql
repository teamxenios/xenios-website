\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create extension pgcrypto with schema extensions;

create table public.research_orders (
  id uuid primary key,
  member_id uuid not null,
  state text not null,
  subtotal_cents bigint not null,
  shipping_cents bigint not null,
  store_credit_applied_cents bigint not null,
  total_cents bigint not null,
  authorized_amount_cents bigint,
  captured_amount_cents bigint,
  refunded_cents bigint not null,
  payment_reference text,
  checkout_idempotency_key text,
  last_idempotency_key text,
  review_triggers text[] not null,
  placed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(member_id, checkout_idempotency_key)
);
create table public.research_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.research_orders(id),
  sku text not null,
  display_name text not null,
  quantity integer not null,
  unit_price_cents bigint not null,
  line_total_cents bigint not null,
  fulfillment_owner text not null
);
create table public.research_order_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.research_orders(id),
  seq integer not null,
  owner text not null,
  status text not null,
  tracking_number text,
  carrier text,
  created_at timestamptz not null,
  unique(order_id, seq)
);
create table public.research_order_state_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.research_orders(id),
  from_state text not null,
  to_state text not null,
  actor_type text not null,
  actor_id text,
  provider_reference text,
  idempotency_key text,
  occurred_at timestamptz not null
);

create table public.research_store_credit_ledger (
  id uuid primary key,
  member_id uuid not null,
  amount_cents bigint not null,
  state text not null,
  reason text not null,
  available_at timestamptz,
  reverses_id uuid,
  actor_type text not null,
  actor_id text,
  created_at timestamptz not null,
  expires_at timestamptz
);

create table public.research_checkout_activation_intents (
  id uuid primary key,
  member_id uuid not null,
  checkout_idempotency_key_hash text not null,
  cart_id uuid not null,
  cart_version bigint not null,
  cart_fingerprint text not null,
  authorization_digest text not null,
  checkout_command_id uuid,
  checkout_command_digest text,
  state text not null check (state in ('authorized','claimed','consumed','cancelled')),
  authorized_at timestamptz not null,
  expires_at timestamptz not null,
  bound_at timestamptz,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  unique(member_id, checkout_idempotency_key_hash)
);
create table public.research_checkout_activation_intent_lines (
  intent_id uuid not null references public.research_checkout_activation_intents(id),
  ordinal integer not null,
  product_id uuid not null,
  variant_id uuid not null,
  sku text not null,
  quantity integer not null,
  purchase_mode text not null,
  subscription_frequency_days integer,
  product_revision bigint not null,
  variant_revision bigint not null,
  binding_fingerprint text not null,
  activation_ledger_revision bigint not null,
  activation_evidence_fingerprint text not null,
  primary key(intent_id, ordinal),
  unique(intent_id, sku)
);

create function public.research_checkout_activation_intent_claim_v1(
  p_member uuid, p_key_hash text, p_intent uuid, p_checkout_command uuid,
  p_expected_cart_fingerprint text, p_at timestamptz
) returns jsonb language plpgsql as $$
declare v public.research_checkout_activation_intents%rowtype;
begin
  select * into v from public.research_checkout_activation_intents
   where id = p_intent and member_id = p_member and checkout_idempotency_key_hash = p_key_hash
   for update;
  if not found or v.cart_fingerprint <> p_expected_cart_fingerprint then
    return jsonb_build_object('ok',false,'code','refused');
  end if;
  if v.state = 'claimed' and v.checkout_command_id = p_checkout_command then
    return jsonb_build_object('ok',true,'state','claimed','idempotent',true);
  end if;
  if v.state <> 'authorized' or v.expires_at <= p_at then
    return jsonb_build_object('ok',false,'code','refused');
  end if;
  update public.research_checkout_activation_intents set
    state='claimed', checkout_command_id=p_checkout_command,
    checkout_command_digest='sha256:' || repeat('c',64), bound_at=p_at
  where id=p_intent;
  return jsonb_build_object('ok',true,'state','claimed','idempotent',false);
end $$;

create function public.research_checkout_activation_intent_consume_v1(
  p_member uuid, p_key_hash text, p_intent uuid, p_checkout_command uuid,
  p_expected_cart_fingerprint text, p_at timestamptz
) returns jsonb language plpgsql as $$
declare v public.research_checkout_activation_intents%rowtype;
begin
  select * into v from public.research_checkout_activation_intents where id=p_intent for update;
  if not found or v.member_id<>p_member or v.checkout_idempotency_key_hash<>p_key_hash
     or v.checkout_command_id<>p_checkout_command or v.cart_fingerprint<>p_expected_cart_fingerprint then
    return jsonb_build_object('ok',false,'code','refused');
  end if;
  if v.state='consumed' then return jsonb_build_object('ok',true,'state','consumed','idempotent',true); end if;
  if v.state<>'claimed' then return jsonb_build_object('ok',false,'code','refused'); end if;
  update public.research_checkout_activation_intents set state='consumed',consumed_at=p_at where id=p_intent;
  return jsonb_build_object('ok',true,'state','consumed','idempotent',false);
end $$;

create function public.research_checkout_activation_intent_cancel_v1(
  p_member uuid, p_key_hash text, p_intent uuid, p_checkout_command uuid, p_at timestamptz
) returns jsonb language plpgsql as $$
declare v public.research_checkout_activation_intents%rowtype;
begin
  select * into v from public.research_checkout_activation_intents where id=p_intent for update;
  if not found or v.member_id<>p_member or v.checkout_idempotency_key_hash<>p_key_hash
     or v.checkout_command_id<>p_checkout_command then
    return jsonb_build_object('ok',false,'code','refused');
  end if;
  if v.state='cancelled' then return jsonb_build_object('ok',true,'state','cancelled','idempotent',true); end if;
  if v.state<>'claimed' then return jsonb_build_object('ok',false,'code','refused'); end if;
  update public.research_checkout_activation_intents set state='cancelled',cancelled_at=p_at where id=p_intent;
  return jsonb_build_object('ok',true,'state','cancelled','idempotent',false);
end $$;

create table public.test_inventory_reservations (
  reservation_id text primary key,
  member_id uuid not null,
  status text not null,
  command_key text not null unique
);
create function public.research_reserve_inventory(
  p_member_id uuid, p_actor_id uuid, p_lines jsonb, p_at timestamptz,
  p_expires_at timestamptz, p_idempotency_key text
) returns jsonb language plpgsql as $$
declare v_id text; v_result jsonb;
begin
  select reservation_id into v_id from public.test_inventory_reservations where command_key=p_idempotency_key;
  if found then return jsonb_build_object('action','reserve','idempotentReplay',true,'reservations',jsonb_build_array(jsonb_build_object('reservationId',v_id))); end if;
  v_id := gen_random_uuid()::text;
  insert into public.test_inventory_reservations values(v_id,p_member_id,'held',p_idempotency_key);
  return jsonb_build_object('action','reserve','idempotentReplay',false,'reservations',jsonb_build_array(jsonb_build_object('reservationId',v_id)));
end $$;
create function public.research_release_inventory_reservations(
  p_member_id uuid, p_actor_id uuid, p_reservation_ids text[], p_at timestamptz,
  p_idempotency_key text, p_reason text
) returns jsonb language plpgsql as $$
begin
  update public.test_inventory_reservations set status='released'
   where member_id=p_member_id and reservation_id=any(p_reservation_ids) and status='held';
  if not found then raise exception 'release refused'; end if;
  return jsonb_build_object('action','release');
end $$;
create function public.research_finalize_inventory_reservations(
  p_member_id uuid, p_actor_id uuid, p_reservation_ids text[], p_at timestamptz,
  p_idempotency_key text, p_reason text
) returns jsonb language plpgsql as $$
begin
  update public.test_inventory_reservations set status='finalized'
   where member_id=p_member_id and reservation_id=any(p_reservation_ids) and status='held';
  if not found then raise exception 'finalize refused'; end if;
  return jsonb_build_object('action','finalize');
end $$;
