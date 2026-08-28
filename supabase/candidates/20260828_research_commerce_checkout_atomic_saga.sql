-- XENIOS RESEARCH CHECKOUT FINANCIAL ATOMICITY P1 — CANDIDATE ONLY.
--
-- BASE ATTESTATION: ace92fd65ab46213aa5899a1591d4c565099fd0f
-- STATUS: UNAPPLIED. This file is outside supabase/migrations, the migration
-- DAG, and every production ledger. Application composition also requires the
-- exact default-off flag RESEARCH_CHECKOUT_ATOMIC_SAGA_ENABLED=true.
--
-- IMPORTANT: no database transaction spans a payment-provider request. These
-- RPCs persist a serialized command before provider I/O. Provider calls happen
-- outside SQL with phase-specific durable idempotency keys. A later RPC either
-- atomically publishes all internal captured effects, atomically compensates
-- a provider-proven non-capture, or leaves an explicit reconciliation state.
--
-- Required reviewed dependencies (this candidate refuses to install without
-- them): canonical order/store-credit tables, atomic inventory RPCs, and the
-- activation intent claim/consume/cancel lifecycle. Claim is the critical
-- before-provider boundary: an unclaimed or stale activation intent cannot be
-- used, while the exact same claimed command remains recoverable after expiry.

begin;

do $preflight$
declare
  v_missing text[] := '{}';
begin
  if to_regclass('public.research_orders') is null then v_missing := v_missing || 'public.research_orders'; end if;
  if to_regclass('public.research_order_lines') is null then v_missing := v_missing || 'public.research_order_lines'; end if;
  if to_regclass('public.research_order_state_events') is null then v_missing := v_missing || 'public.research_order_state_events'; end if;
  if to_regclass('public.research_order_shipments') is null then v_missing := v_missing || 'public.research_order_shipments'; end if;
  if to_regclass('public.research_store_credit_ledger') is null then v_missing := v_missing || 'public.research_store_credit_ledger'; end if;
  if to_regclass('public.research_checkout_activation_intents') is null then v_missing := v_missing || 'public.research_checkout_activation_intents'; end if;
  if to_regclass('public.research_checkout_activation_intent_lines') is null then v_missing := v_missing || 'public.research_checkout_activation_intent_lines'; end if;
  if to_regprocedure('public.research_reserve_inventory(uuid,uuid,jsonb,timestamp with time zone,timestamp with time zone,text)') is null then v_missing := v_missing || 'public.research_reserve_inventory'; end if;
  if to_regprocedure('public.research_release_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)') is null then v_missing := v_missing || 'public.research_release_inventory_reservations'; end if;
  if to_regprocedure('public.research_finalize_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)') is null then v_missing := v_missing || 'public.research_finalize_inventory_reservations'; end if;
  if to_regprocedure('public.research_checkout_activation_intent_claim_v1(uuid,text,uuid,uuid,text,timestamp with time zone)') is null then v_missing := v_missing || 'public.research_checkout_activation_intent_claim_v1'; end if;
  if to_regprocedure('public.research_checkout_activation_intent_consume_v1(uuid,text,uuid,uuid,text,timestamp with time zone)') is null then v_missing := v_missing || 'public.research_checkout_activation_intent_consume_v1'; end if;
  if to_regprocedure('public.research_checkout_activation_intent_cancel_v1(uuid,text,uuid,uuid,timestamp with time zone)') is null then v_missing := v_missing || 'public.research_checkout_activation_intent_cancel_v1'; end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'research_store_credit_ledger' and column_name = 'expires_at'
  ) then v_missing := v_missing || 'public.research_store_credit_ledger.expires_at'; end if;
  if cardinality(v_missing) > 0 then
    raise exception 'checkout saga candidate prerequisites missing: %', array_to_string(v_missing, ', ');
  end if;
end;
$preflight$;

create table public.research_checkout_commands (
  command_id uuid primary key,
  member_id uuid not null,
  checkout_idempotency_key_hash text not null
    check (checkout_idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  command_payload jsonb not null check (jsonb_typeof(command_payload) = 'object'),
  command_digest text not null check (command_digest ~ '^sha256:[a-f0-9]{64}$'),
  activation_intent_id uuid not null
    references public.research_checkout_activation_intents(id),
  cart_fingerprint text not null check (cart_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  order_id uuid not null unique,
  state text not null check (state in (
    'authorization_pending', 'authorization_reconciliation_pending',
    'capture_pending', 'capture_reconciliation_pending',
    'cancellation_pending', 'cancellation_reconciliation_pending',
    'completed', 'rejected'
  )),
  reservation_ids text[] not null check (cardinality(reservation_ids) between 1 and 100),
  provider_reference text,
  authorized_amount_cents bigint check (authorized_amount_cents > 0),
  captured_amount_cents bigint check (captured_amount_cents > 0),
  last_reconciliation_phase text check (
    last_reconciliation_phase is null or
    last_reconciliation_phase in ('authorization', 'capture', 'cancellation')
  ),
  last_provider_code text check (
    last_provider_code is null or
    last_provider_code in ('DISABLED', 'MISCONFIGURED', 'REJECTED', 'RETRYABLE', 'PERMANENT_FAILURE')
  ),
  order_snapshot jsonb check (order_snapshot is null or jsonb_typeof(order_snapshot) = 'object'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz,
  rejected_at timestamptz,
  constraint research_checkout_commands_member_key_unique
    unique (member_id, checkout_idempotency_key_hash),
  constraint research_checkout_commands_capture_exact check (
    captured_amount_cents is null or captured_amount_cents = authorized_amount_cents
  ),
  constraint research_checkout_commands_terminal_shape check (
    (state = 'completed' and captured_amount_cents is not null and order_snapshot is not null and completed_at is not null and rejected_at is null)
    or (state = 'rejected' and captured_amount_cents is null and order_snapshot is null and rejected_at is not null and completed_at is null)
    or (state not in ('completed', 'rejected') and captured_amount_cents is null and order_snapshot is null and completed_at is null and rejected_at is null)
  )
);

create index research_checkout_commands_reconciliation_idx
  on public.research_checkout_commands(updated_at, command_id)
  where state in (
    'authorization_reconciliation_pending',
    'capture_reconciliation_pending',
    'cancellation_reconciliation_pending'
  );

create table public.research_checkout_credit_holds (
  command_id uuid primary key references public.research_checkout_commands(command_id),
  member_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  state text not null check (state in ('held', 'consumed', 'released')),
  created_at timestamptz not null,
  terminal_at timestamptz,
  constraint research_checkout_credit_holds_terminal_shape check (
    (state = 'held' and terminal_at is null) or
    (state in ('consumed', 'released') and terminal_at is not null)
  )
);
create index research_checkout_credit_holds_member_idx
  on public.research_checkout_credit_holds(member_id)
  where state = 'held';

create table public.research_checkout_credit_spends (
  command_id uuid primary key references public.research_checkout_commands(command_id),
  ledger_id uuid not null unique references public.research_store_credit_ledger(id),
  amount_cents bigint not null check (amount_cents > 0),
  recorded_at timestamptz not null
);

create table public.research_checkout_command_events (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references public.research_checkout_commands(command_id),
  from_state text,
  to_state text not null,
  event_kind text not null check (event_kind in (
    'begun', 'authorization_recorded', 'reconciliation_marked',
    'cancellation_started', 'completed', 'compensated'
  )),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  occurred_at timestamptz not null
);
create index research_checkout_command_events_command_idx
  on public.research_checkout_command_events(command_id, occurred_at, id);

-- Recursive JSON encoding matching canonicalCheckoutJson in checkout-saga.ts:
-- sorted object keys, preserved array order, no insignificant whitespace.
create function public.research_checkout_canonical_json_v1(p_value jsonb)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $function$
declare
  v_result text;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      select '{' || coalesce(string_agg(
        to_jsonb(entry.key)::text || ':' || public.research_checkout_canonical_json_v1(entry.value),
        ',' order by entry.key
      ), '') || '}'
        into v_result
        from jsonb_each(p_value) as entry;
      return v_result;
    when 'array' then
      select '[' || coalesce(string_agg(
        public.research_checkout_canonical_json_v1(item.value),
        ',' order by item.ordinality
      ), '') || ']'
        into v_result
        from jsonb_array_elements(p_value) with ordinality as item(value, ordinality);
      return v_result;
    else
      return p_value::text;
  end case;
end;
$function$;

create function public.research_checkout_command_snapshot_v1(p_command_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'command', c.command_payload,
    'commandDigest', c.command_digest,
    'state', c.state,
    'reservationIds', to_jsonb(c.reservation_ids),
    'providerReference', to_jsonb(c.provider_reference),
    'authorizedAmountCents', to_jsonb(c.authorized_amount_cents),
    'capturedAmountCents', to_jsonb(c.captured_amount_cents),
    'order', c.order_snapshot,
    'lastReconciliationPhase', to_jsonb(c.last_reconciliation_phase)
  )
  from public.research_checkout_commands c
  where c.command_id = p_command_id
$function$;

create function public.research_checkout_event_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  raise exception 'checkout command events are immutable';
end;
$function$;

create trigger research_checkout_command_events_no_update
before update or delete on public.research_checkout_command_events
for each row execute function public.research_checkout_event_immutable_v1();

create function public.research_checkout_command_update_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if new.command_id <> old.command_id
     or new.member_id <> old.member_id
     or new.checkout_idempotency_key_hash <> old.checkout_idempotency_key_hash
     or new.command_payload <> old.command_payload
     or new.command_digest <> old.command_digest
     or new.activation_intent_id <> old.activation_intent_id
     or new.cart_fingerprint <> old.cart_fingerprint
     or new.order_id <> old.order_id
     or new.reservation_ids <> old.reservation_ids
     or new.created_at <> old.created_at then
    raise exception 'immutable checkout command binding cannot change';
  end if;
  if old.state in ('completed', 'rejected') then
    raise exception 'terminal checkout command cannot change';
  end if;
  if not (
    (old.state in ('authorization_pending', 'authorization_reconciliation_pending') and
      new.state in ('authorization_pending', 'authorization_reconciliation_pending', 'capture_pending', 'cancellation_pending', 'rejected'))
    or (old.state in ('capture_pending', 'capture_reconciliation_pending') and
      new.state in ('capture_pending', 'capture_reconciliation_pending', 'cancellation_pending', 'completed'))
    or (old.state in ('cancellation_pending', 'cancellation_reconciliation_pending') and
      new.state in ('cancellation_pending', 'cancellation_reconciliation_pending', 'completed', 'rejected'))
  ) then
    raise exception 'invalid checkout command state transition';
  end if;
  if new.updated_at < old.updated_at then
    raise exception 'checkout command time cannot move backwards';
  end if;
  return new;
end;
$function$;

create trigger research_checkout_commands_update_guard
before update on public.research_checkout_commands
for each row execute function public.research_checkout_command_update_guard_v1();

create function public.research_checkout_credit_hold_update_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if new.command_id <> old.command_id or new.member_id <> old.member_id or
     new.amount_cents <> old.amount_cents or new.created_at <> old.created_at then
    raise exception 'immutable checkout credit hold binding cannot change';
  end if;
  if old.state <> 'held' or new.state not in ('consumed', 'released') then
    raise exception 'invalid checkout credit hold transition';
  end if;
  return new;
end;
$function$;

create trigger research_checkout_credit_holds_update_guard
before update on public.research_checkout_credit_holds
for each row execute function public.research_checkout_credit_hold_update_guard_v1();

-- This closes the cross-process balance race for every negative approved append,
-- including the legacy store writer. Begin and this trigger share one member
-- advisory lock. Active saga holds are deducted; atomic completion identifies
-- its own hold through a transaction-local command id and may consume exactly it.
create function public.research_checkout_store_credit_spend_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_balance bigint;
  v_holds bigint;
  v_own_hold bigint := 0;
  v_command_text text;
begin
  if new.state <> 'approved' or new.amount_cents >= 0 then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('research-checkout-credit:' || new.member_id::text, 0));

  select coalesce(sum(l.amount_cents), 0)::bigint
    into v_balance
    from public.research_store_credit_ledger l
   where l.member_id = new.member_id
     and l.state = 'approved'
     and (l.available_at is null or l.available_at <= new.created_at)
     and (l.amount_cents < 0 or l.expires_at is null or l.expires_at > new.created_at);

  select coalesce(sum(h.amount_cents), 0)::bigint
    into v_holds
    from public.research_checkout_credit_holds h
   where h.member_id = new.member_id and h.state = 'held';

  v_command_text := current_setting('xenios.checkout_command_id', true);
  if v_command_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select coalesce(h.amount_cents, 0)
      into v_own_hold
      from public.research_checkout_credit_holds h
      join public.research_checkout_commands c on c.command_id = h.command_id
     where h.command_id = v_command_text::uuid
       and h.member_id = new.member_id
       and h.state = 'held'
       and c.order_id::text = new.actor_id
       and c.state in ('capture_pending', 'capture_reconciliation_pending', 'cancellation_pending', 'cancellation_reconciliation_pending');
  end if;

  if -new.amount_cents > v_balance - v_holds + coalesce(v_own_hold, 0) then
    raise exception 'store credit spend exceeds serialized available balance';
  end if;
  return new;
end;
$function$;

create trigger research_checkout_store_credit_spend_guard
before insert on public.research_store_credit_ledger
for each row execute function public.research_checkout_store_credit_spend_guard_v1();

create function public.research_checkout_command_find_v1(
  p_member_id uuid,
  p_checkout_idempotency_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_id uuid;
begin
  if p_member_id is null or p_checkout_idempotency_key_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'capability_unavailable');
  end if;
  select c.command_id into v_id
    from public.research_checkout_commands c
   where c.member_id = p_member_id
     and c.checkout_idempotency_key_hash = p_checkout_idempotency_key_hash;
  return jsonb_build_object(
    'ok', true,
    'snapshot', case when v_id is null then null else public.research_checkout_command_snapshot_v1(v_id) end
  );
end;
$function$;

create function public.research_checkout_command_begin_v1(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_command_id uuid;
  v_order_id uuid;
  v_member_id uuid;
  v_intent_id uuid;
  v_cart_id uuid;
  v_cart_version bigint;
  v_key text;
  v_key_hash text;
  v_cart_fingerprint text;
  v_digest text;
  v_existing public.research_checkout_commands%rowtype;
  v_intent public.research_checkout_activation_intents%rowtype;
  v_db_lines jsonb;
  v_claim jsonb;
  v_reserved jsonb;
  v_reservation_ids text[];
  v_at timestamptz;
  v_claim_at timestamptz;
  v_activation_expires timestamptz;
  v_credit bigint;
  v_total bigint;
  v_subtotal bigint;
  v_shipping bigint;
  v_balance bigint;
  v_holds bigint;
  v_step text;
begin
  begin
    if jsonb_typeof(p_command) <> 'object'
       or p_command->>'protocol' <> 'xenios:research-checkout-saga:v1'
       or jsonb_typeof(p_command->'request') <> 'object'
       or jsonb_typeof(p_command->'activation') <> 'object'
       or jsonb_typeof(p_command->'cart') <> 'object'
       or jsonb_typeof(p_command#>'{cart,lines}') <> 'array'
       or jsonb_array_length(p_command#>'{cart,lines}') not between 1 and 100
       or jsonb_typeof(p_command#>'{cart,shipmentGroups}') <> 'array'
       or jsonb_typeof(p_command->'totals') <> 'object' then
      return jsonb_build_object('ok', false, 'code', 'command_invalid');
    end if;
    v_command_id := (p_command->>'commandId')::uuid;
    v_order_id := (p_command->>'orderId')::uuid;
    v_member_id := (p_command->>'memberId')::uuid;
    v_intent_id := (p_command#>>'{activation,intentId}')::uuid;
    v_cart_id := (p_command#>>'{activation,cartId}')::uuid;
    v_cart_version := (p_command#>>'{activation,cartVersion}')::bigint;
    v_at := (p_command->>'placedAt')::timestamptz;
    v_activation_expires := (p_command#>>'{activation,expiresAt}')::timestamptz;
    v_key := p_command->>'checkoutIdempotencyKey';
    v_key_hash := p_command->>'checkoutIdempotencyKeyHash';
    v_cart_fingerprint := p_command#>>'{activation,cartFingerprint}';
    v_credit := (p_command#>>'{totals,storeCreditAppliedCents}')::bigint;
    v_total := (p_command#>>'{totals,totalCents}')::bigint;
    v_subtotal := (p_command#>>'{totals,subtotalCents}')::bigint;
    v_shipping := (p_command#>>'{totals,shippingCents}')::bigint;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'command_invalid');
  end;

  if v_command_id is null or v_order_id is null or v_member_id is null or v_intent_id is null
     or char_length(coalesce(v_key, '')) not between 1 and 200
     or v_key !~ '^[A-Za-z0-9:_-]+$'
     or v_key_hash !~ '^[a-f0-9]{64}$'
     or v_cart_fingerprint !~ '^sha256:[a-f0-9]{64}$'
     or v_cart_version < 1
     or date_trunc('milliseconds', v_at) <> v_at
     or date_trunc('milliseconds', v_activation_expires) <> v_activation_expires
     or v_at >= v_activation_expires
     or v_subtotal < 0 or v_shipping < 0 or v_credit < 0 or v_total <= 0
     or v_credit > v_subtotal + v_shipping
     or p_command#>>'{totals,currency}' <> 'usd'
     or v_total <> v_subtotal + v_shipping - v_credit
     or (p_command#>>'{cart,subtotalCents}')::bigint <> v_subtotal
     or (p_command#>>'{cart,storeCreditAppliedCents}')::bigint <> v_credit
     or (p_command#>>'{shippingQuote,amountCents}')::bigint <> v_shipping
     or (p_command#>>'{request,applyStoreCreditCents}')::bigint <> v_credit
     or (p_command#>>'{request,researchAttestation}')::boolean is not true
     or char_length(coalesce(p_command#>>'{request,paymentMethodReference}', '')) not between 3 and 200
     or p_command#>>'{request,paymentMethodReference}' !~ '^[A-Za-z0-9_:-]+$'
     or p_command#>>'{request,paymentMethodReference}' ~ '[0-9]{13,19}'
     or coalesce(jsonb_array_length(p_command->'reviewTriggers'), -1) <> 0 then
    return jsonb_build_object('ok', false, 'code', 'command_invalid');
  end if;

  v_digest := 'sha256:' || encode(extensions.digest(
    convert_to(public.research_checkout_canonical_json_v1(p_command), 'UTF8'), 'sha256'
  ), 'hex');
  if v_key_hash <> encode(extensions.digest(convert_to(
       public.research_checkout_canonical_json_v1(jsonb_build_array('checkout-key', v_member_id::text, v_key)),
       'UTF8'), 'sha256'), 'hex')
     or p_command->>'providerAuthorizationKey' <> 'xr_checkout_authorize_v1_' || encode(extensions.digest(convert_to(
       public.research_checkout_canonical_json_v1(jsonb_build_array('xenios:research-checkout-saga:v1', 'authorize', v_command_id::text)),
       'UTF8'), 'sha256'), 'hex')
     or p_command->>'providerCaptureKey' <> 'xr_checkout_capture_v1_' || encode(extensions.digest(convert_to(
       public.research_checkout_canonical_json_v1(jsonb_build_array('xenios:research-checkout-saga:v1', 'capture', v_command_id::text)),
       'UTF8'), 'sha256'), 'hex')
     or p_command->>'providerCancellationKey' <> 'xr_checkout_cancel_v1_' || encode(extensions.digest(convert_to(
       public.research_checkout_canonical_json_v1(jsonb_build_array('xenios:research-checkout-saga:v1', 'cancel', v_command_id::text)),
       'UTF8'), 'sha256'), 'hex') then
    return jsonb_build_object('ok', false, 'code', 'command_invalid');
  end if;

  if (select coalesce(sum((line->>'lineTotalCents')::bigint), -1)
        from jsonb_array_elements(p_command#>'{cart,lines}') line) <> v_subtotal
     or exists (
       select 1 from jsonb_array_elements(p_command#>'{cart,lines}') line
        where (line->>'quantity')::bigint < 1
           or (line->>'unitPriceCents')::bigint < 0
           or (line->>'lineTotalCents')::bigint <> (line->>'quantity')::bigint * (line->>'unitPriceCents')::bigint
           or (select count(*) from jsonb_array_elements(p_command#>'{cart,shipmentGroups}') g
                where g->'skus' ? (line->>'sku')) <> 1
     ) then
    return jsonb_build_object('ok', false, 'code', 'command_invalid');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'research-checkout-command:' || v_member_id::text || ':' || v_key_hash, 0
  ));
  select * into v_existing from public.research_checkout_commands c
   where c.member_id = v_member_id and c.checkout_idempotency_key_hash = v_key_hash
   for update;
  if found then
    if v_existing.command_digest <> v_digest or v_existing.command_payload <> p_command then
      return jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
    end if;
    return jsonb_build_object(
      'ok', true,
      'snapshot', public.research_checkout_command_snapshot_v1(v_existing.command_id),
      'idempotent', true
    );
  end if;

  select * into v_intent from public.research_checkout_activation_intents i
   where i.id = v_intent_id and i.member_id = v_member_id
     and i.checkout_idempotency_key_hash = v_key_hash
   for update;
  if not found
     or v_intent.state not in ('authorized', 'claimed')
     or v_intent.cart_id <> v_cart_id
     or v_intent.cart_version <> v_cart_version
     or v_intent.cart_fingerprint <> v_cart_fingerprint
     or v_intent.authorized_at <> (p_command#>>'{activation,authorizedAt}')::timestamptz
     or v_intent.expires_at <> v_activation_expires then
    return jsonb_build_object('ok', false, 'code', 'command_invalid');
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'productId', l.product_id,
    'variantId', l.variant_id,
    'sku', l.sku,
    'productRevision', l.product_revision,
    'variantRevision', l.variant_revision,
    'bindingFingerprint', l.binding_fingerprint,
    'activationLedgerRevision', l.activation_ledger_revision,
    'activationEvidenceFingerprint', l.activation_evidence_fingerprint,
    'quantity', l.quantity,
    'purchaseMode', l.purchase_mode,
    'subscriptionFrequencyDays', l.subscription_frequency_days
  )) order by l.ordinal), '[]'::jsonb)
    into v_db_lines
    from public.research_checkout_activation_intent_lines l
   where l.intent_id = v_intent_id;
  if v_db_lines <> p_command#>'{activation,lines}' then
    return jsonb_build_object('ok', false, 'code', 'command_invalid');
  end if;

  -- Claim freshness is checked against the database clock, never the command's
  -- earlier evaluatedAt/placedAt. A stalled process cannot backdate a claim.
  v_claim_at := date_trunc('milliseconds', clock_timestamp());
  if v_claim_at >= v_activation_expires then
    return jsonb_build_object('ok', false, 'code', 'activation_unavailable');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('research-checkout-credit:' || v_member_id::text, 0));
  if v_credit > 0 then
    select coalesce(sum(l.amount_cents), 0)::bigint into v_balance
      from public.research_store_credit_ledger l
     where l.member_id = v_member_id and l.state = 'approved'
       and (l.available_at is null or l.available_at <= v_at)
       and (l.amount_cents < 0 or l.expires_at is null or l.expires_at > v_at);
    select coalesce(sum(h.amount_cents), 0)::bigint into v_holds
      from public.research_checkout_credit_holds h
     where h.member_id = v_member_id and h.state = 'held';
    if v_credit > v_balance - v_holds then
      return jsonb_build_object('ok', false, 'code', 'credit_unavailable');
    end if;
  end if;

  v_step := 'claim';
  begin
    v_claim := public.research_checkout_activation_intent_claim_v1(
      v_member_id, v_key_hash, v_intent_id, v_command_id, v_cart_fingerprint, v_claim_at
    );
    if coalesce((v_claim->>'ok')::boolean, false) is not true then
      raise exception 'activation claim refused';
    end if;
    v_step := 'reserve';
    v_reserved := public.research_reserve_inventory(
      v_member_id,
      v_member_id,
      (select jsonb_agg(jsonb_build_object('sku', line->>'sku', 'quantity', (line->>'quantity')::integer) order by line->>'sku')
         from jsonb_array_elements(p_command#>'{cart,lines}') line),
      v_at,
      'infinity'::timestamptz,
      'checkout-reserve-v1:' || v_command_id::text
    );
    select array_agg(item->>'reservationId' order by item->>'reservationId')
      into v_reservation_ids
      from jsonb_array_elements(v_reserved->'reservations') item;
    if cardinality(v_reservation_ids) < 1 or exists (
      select 1 from unnest(v_reservation_ids) id where id !~* '^[0-9a-f-]{36}$'
    ) then raise exception 'inventory reservation response invalid'; end if;
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'code', case when v_step = 'claim' then 'activation_unavailable' else 'inventory_unavailable' end
    );
  end;

  insert into public.research_checkout_commands (
    command_id, member_id, checkout_idempotency_key_hash, command_payload,
    command_digest, activation_intent_id, cart_fingerprint, order_id, state,
    reservation_ids, created_at, updated_at
  ) values (
    v_command_id, v_member_id, v_key_hash, p_command,
    v_digest, v_intent_id, v_cart_fingerprint, v_order_id, 'authorization_pending',
    v_reservation_ids, v_at, v_at
  );
  if v_credit > 0 then
    insert into public.research_checkout_credit_holds(command_id, member_id, amount_cents, state, created_at)
    values (v_command_id, v_member_id, v_credit, 'held', v_at);
  end if;
  insert into public.research_checkout_command_events(command_id, from_state, to_state, event_kind, occurred_at)
  values (v_command_id, null, 'authorization_pending', 'begun', v_at);
  return jsonb_build_object(
    'ok', true,
    'snapshot', public.research_checkout_command_snapshot_v1(v_command_id),
    'idempotent', false
  );
end;
$function$;

create function public.research_checkout_command_record_authorization_v1(
  p_command_id uuid,
  p_provider_reference text,
  p_authorized_amount_cents bigint,
  p_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_row public.research_checkout_commands%rowtype; v_total bigint;
begin
  select * into v_row from public.research_checkout_commands where command_id = p_command_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  v_total := (v_row.command_payload#>>'{totals,totalCents}')::bigint;
  if char_length(coalesce(p_provider_reference, '')) not between 1 and 500
     or p_authorized_amount_cents <> v_total or p_at < v_row.updated_at
     or date_trunc('milliseconds', p_at) <> p_at then
    return jsonb_build_object('ok', false, 'code', 'state_conflict');
  end if;
  if v_row.state in ('capture_pending', 'capture_reconciliation_pending', 'completed') then
    if v_row.provider_reference = p_provider_reference and v_row.authorized_amount_cents = p_authorized_amount_cents then
      return jsonb_build_object('ok', true, 'snapshot', public.research_checkout_command_snapshot_v1(p_command_id), 'idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'state_conflict');
  end if;
  if v_row.state not in ('authorization_pending', 'authorization_reconciliation_pending') then
    return jsonb_build_object('ok', false, 'code', 'state_conflict');
  end if;
  update public.research_checkout_commands set
    provider_reference = p_provider_reference,
    authorized_amount_cents = p_authorized_amount_cents,
    state = 'capture_pending', last_reconciliation_phase = null, last_provider_code = null,
    updated_at = p_at
  where command_id = p_command_id;
  insert into public.research_checkout_command_events(command_id, from_state, to_state, event_kind, evidence, occurred_at)
  values (p_command_id, v_row.state, 'capture_pending', 'authorization_recorded',
    jsonb_build_object('providerReference', p_provider_reference, 'authorizedAmountCents', p_authorized_amount_cents), p_at);
  return jsonb_build_object('ok', true, 'snapshot', public.research_checkout_command_snapshot_v1(p_command_id), 'idempotent', false);
end;
$function$;

create function public.research_checkout_command_mark_reconciliation_v1(
  p_command_id uuid,
  p_phase text,
  p_provider_reference text,
  p_provider_code text,
  p_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_row public.research_checkout_commands%rowtype; v_target text;
begin
  select * into v_row from public.research_checkout_commands where command_id = p_command_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if p_phase not in ('authorization', 'capture', 'cancellation')
     or p_provider_code not in ('DISABLED', 'MISCONFIGURED', 'REJECTED', 'RETRYABLE', 'PERMANENT_FAILURE')
     or p_at < v_row.updated_at or date_trunc('milliseconds', p_at) <> p_at
     or (v_row.provider_reference is not null and p_provider_reference is not null and v_row.provider_reference <> p_provider_reference) then
    return jsonb_build_object('ok', false, 'code', 'state_conflict');
  end if;
  v_target := p_phase || '_reconciliation_pending';
  if (p_phase = 'authorization' and v_row.state not in ('authorization_pending', 'authorization_reconciliation_pending'))
     or (p_phase = 'capture' and v_row.state not in ('capture_pending', 'capture_reconciliation_pending'))
     or (p_phase = 'cancellation' and v_row.state not in ('cancellation_pending', 'cancellation_reconciliation_pending')) then
    if v_row.state in ('completed', 'rejected') then
      return jsonb_build_object('ok', true, 'snapshot', public.research_checkout_command_snapshot_v1(p_command_id), 'idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'state_conflict');
  end if;
  update public.research_checkout_commands set
    state = v_target,
    provider_reference = coalesce(provider_reference, p_provider_reference),
    last_reconciliation_phase = p_phase,
    last_provider_code = p_provider_code,
    updated_at = p_at
  where command_id = p_command_id;
  insert into public.research_checkout_command_events(command_id, from_state, to_state, event_kind, evidence, occurred_at)
  values (p_command_id, v_row.state, v_target, 'reconciliation_marked',
    jsonb_strip_nulls(jsonb_build_object('phase', p_phase, 'providerCode', p_provider_code, 'providerReference', p_provider_reference)), p_at);
  return jsonb_build_object('ok', true, 'snapshot', public.research_checkout_command_snapshot_v1(p_command_id), 'idempotent', v_row.state = v_target);
end;
$function$;

create function public.research_checkout_command_mark_cancellation_pending_v1(
  p_command_id uuid,
  p_provider_reference text,
  p_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_row public.research_checkout_commands%rowtype;
begin
  select * into v_row from public.research_checkout_commands where command_id = p_command_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if char_length(coalesce(p_provider_reference, '')) not between 1 and 500
     or p_at < v_row.updated_at or date_trunc('milliseconds', p_at) <> p_at
     or (v_row.provider_reference is not null and v_row.provider_reference <> p_provider_reference) then
    return jsonb_build_object('ok', false, 'code', 'state_conflict');
  end if;
  if v_row.state in ('cancellation_pending', 'cancellation_reconciliation_pending') then
    return jsonb_build_object('ok', true, 'snapshot', public.research_checkout_command_snapshot_v1(p_command_id), 'idempotent', true);
  end if;
  if v_row.state not in ('authorization_pending', 'authorization_reconciliation_pending', 'capture_pending', 'capture_reconciliation_pending') then
    return jsonb_build_object('ok', false, 'code', 'state_conflict');
  end if;
  update public.research_checkout_commands set state = 'cancellation_pending',
    provider_reference = p_provider_reference, last_reconciliation_phase = 'cancellation',
    last_provider_code = null, updated_at = p_at
  where command_id = p_command_id;
  insert into public.research_checkout_command_events(command_id, from_state, to_state, event_kind, evidence, occurred_at)
  values (p_command_id, v_row.state, 'cancellation_pending', 'cancellation_started',
    jsonb_build_object('providerReference', p_provider_reference), p_at);
  return jsonb_build_object('ok', true, 'snapshot', public.research_checkout_command_snapshot_v1(p_command_id), 'idempotent', false);
end;
$function$;

create function public.research_checkout_command_complete_v1(
  p_command_id uuid,
  p_provider_reference text,
  p_captured_amount_cents bigint,
  p_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_row public.research_checkout_commands%rowtype;
  v_consumed jsonb;
  v_finalized jsonb;
  v_credit bigint;
  v_ledger_id uuid;
  v_line jsonb;
  v_group jsonb;
  v_owner text;
  v_seq integer;
  v_order jsonb;
begin
  select * into v_row from public.research_checkout_commands where command_id = p_command_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_row.state = 'completed' then
    if v_row.provider_reference = p_provider_reference and v_row.captured_amount_cents = p_captured_amount_cents then
      return jsonb_build_object('ok', true, 'snapshot', public.research_checkout_command_snapshot_v1(p_command_id), 'idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'state_conflict');
  end if;
  if v_row.state not in ('capture_pending', 'capture_reconciliation_pending', 'cancellation_pending', 'cancellation_reconciliation_pending')
     or v_row.provider_reference <> p_provider_reference
     or (v_row.state in ('capture_pending', 'capture_reconciliation_pending') and v_row.authorized_amount_cents is distinct from p_captured_amount_cents)
     or (v_row.state in ('cancellation_pending', 'cancellation_reconciliation_pending') and v_row.authorized_amount_cents is not null and v_row.authorized_amount_cents <> p_captured_amount_cents)
     or (v_row.command_payload#>>'{totals,totalCents}')::bigint <> p_captured_amount_cents
     or p_at < v_row.updated_at or date_trunc('milliseconds', p_at) <> p_at
     or exists (select 1 from public.research_orders o where o.id = v_row.order_id or (o.member_id = v_row.member_id and o.checkout_idempotency_key = v_row.command_payload->>'checkoutIdempotencyKey')) then
    return jsonb_build_object('ok', false, 'code', 'state_conflict');
  end if;

  begin
    v_consumed := public.research_checkout_activation_intent_consume_v1(
      v_row.member_id, v_row.checkout_idempotency_key_hash, v_row.activation_intent_id,
      v_row.command_id, v_row.cart_fingerprint, p_at
    );
    if coalesce((v_consumed->>'ok')::boolean, false) is not true then raise exception 'activation consume refused'; end if;

    v_finalized := public.research_finalize_inventory_reservations(
      v_row.member_id, v_row.member_id, v_row.reservation_ids, p_at,
      'checkout-finalize-v1:' || v_row.command_id::text,
      'Captured checkout atomic finalization'
    );
    if v_finalized->>'action' <> 'finalize' then raise exception 'inventory finalize refused'; end if;

    v_credit := (v_row.command_payload#>>'{totals,storeCreditAppliedCents}')::bigint;
    if v_credit > 0 then
      perform set_config('xenios.checkout_command_id', v_row.command_id::text, true);
      v_ledger_id := gen_random_uuid();
      insert into public.research_store_credit_ledger(
        id, member_id, amount_cents, state, reason, available_at,
        reverses_id, actor_type, actor_id, created_at, expires_at
      ) values (
        v_ledger_id, v_row.member_id, -v_credit, 'approved', 'manual_adjustment', null,
        null, 'system', v_row.order_id::text, p_at, null
      );
      insert into public.research_checkout_credit_spends(command_id, ledger_id, amount_cents, recorded_at)
      values (v_row.command_id, v_ledger_id, v_credit, p_at);
      update public.research_checkout_credit_holds
         set state = 'consumed', terminal_at = p_at
       where command_id = v_row.command_id and state = 'held';
      if not found then raise exception 'credit hold absent'; end if;
    end if;

    insert into public.research_orders(
      id, member_id, state, subtotal_cents, shipping_cents,
      store_credit_applied_cents, total_cents, authorized_amount_cents,
      captured_amount_cents, refunded_cents, payment_reference,
      checkout_idempotency_key, last_idempotency_key, review_triggers,
      placed_at, created_at, updated_at
    ) values (
      v_row.order_id, v_row.member_id, 'payment_captured',
      (v_row.command_payload#>>'{totals,subtotalCents}')::bigint,
      (v_row.command_payload#>>'{totals,shippingCents}')::bigint,
      v_credit, p_captured_amount_cents, p_captured_amount_cents,
      p_captured_amount_cents, 0, p_provider_reference,
      v_row.command_payload->>'checkoutIdempotencyKey',
      v_row.command_payload->>'checkoutIdempotencyKey', '{}',
      (v_row.command_payload->>'placedAt')::timestamptz, p_at, p_at
    );

    for v_line in select value from jsonb_array_elements(v_row.command_payload#>'{cart,lines}') loop
      select g.value->>'owner' into v_owner
        from jsonb_array_elements(v_row.command_payload#>'{cart,shipmentGroups}') g(value)
       where g.value->'skus' ? (v_line->>'sku');
      insert into public.research_order_lines(
        order_id, sku, display_name, quantity, unit_price_cents, line_total_cents, fulfillment_owner
      ) values (
        v_row.order_id, v_line->>'sku', v_line->>'displayName',
        (v_line->>'quantity')::integer, (v_line->>'unitPriceCents')::bigint,
        (v_line->>'lineTotalCents')::bigint, v_owner
      );
    end loop;

    v_seq := 0;
    for v_group in select value from jsonb_array_elements(v_row.command_payload#>'{cart,shipmentGroups}') loop
      insert into public.research_order_shipments(order_id, seq, owner, status, tracking_number, carrier, created_at)
      values (v_row.order_id, v_seq, v_group->>'owner', 'pending', null, null, p_at);
      v_seq := v_seq + 1;
    end loop;
    insert into public.research_order_state_events(
      order_id, from_state, to_state, actor_type, actor_id,
      provider_reference, idempotency_key, occurred_at
    ) values (
      v_row.order_id, 'payment_authorized', 'payment_captured', 'system', null,
      p_provider_reference, v_row.command_payload->>'providerCaptureKey', p_at
    );

    v_order := jsonb_build_object(
      'orderId', v_row.order_id,
      'memberId', v_row.member_id,
      'state', 'payment_captured',
      'placedAt', v_row.command_payload->>'placedAt',
      'subtotalCents', (v_row.command_payload#>>'{totals,subtotalCents}')::bigint,
      'shippingCents', (v_row.command_payload#>>'{totals,shippingCents}')::bigint,
      'storeCreditAppliedCents', v_credit,
      'totalCents', p_captured_amount_cents,
      'lines', v_row.command_payload#>'{cart,lines}',
      'shipmentGroups', v_row.command_payload#>'{cart,shipmentGroups}',
      'paymentReference', p_provider_reference,
      'captured', true,
      'reviewTriggers', '[]'::jsonb,
      'idempotencyKey', v_row.command_payload->>'checkoutIdempotencyKey',
      'reservationIds', to_jsonb(v_row.reservation_ids)
    );
    update public.research_checkout_commands set
      state = 'completed', authorized_amount_cents = coalesce(authorized_amount_cents, p_captured_amount_cents),
      captured_amount_cents = p_captured_amount_cents,
      order_snapshot = v_order, last_reconciliation_phase = null,
      last_provider_code = null, completed_at = p_at, updated_at = p_at
    where command_id = v_row.command_id;
    insert into public.research_checkout_command_events(command_id, from_state, to_state, event_kind, evidence, occurred_at)
    values (v_row.command_id, v_row.state, 'completed', 'completed',
      jsonb_build_object('providerReference', p_provider_reference, 'capturedAmountCents', p_captured_amount_cents), p_at);
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'state_conflict');
  end;
  return jsonb_build_object('ok', true, 'snapshot', public.research_checkout_command_snapshot_v1(p_command_id), 'idempotent', false);
end;
$function$;

create function public.research_checkout_command_compensate_v1(
  p_command_id uuid,
  p_at timestamptz,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_row public.research_checkout_commands%rowtype; v_cancelled jsonb; v_released jsonb;
begin
  select * into v_row from public.research_checkout_commands where command_id = p_command_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_row.state = 'rejected' then
    return jsonb_build_object('ok', true, 'snapshot', public.research_checkout_command_snapshot_v1(p_command_id), 'idempotent', true);
  end if;
  if p_reason not in ('authorization_rejected', 'authorization_cancelled', 'capture_rejected')
     or v_row.captured_amount_cents is not null
     or p_at < v_row.updated_at or date_trunc('milliseconds', p_at) <> p_at
     or (v_row.provider_reference is null and v_row.state not in ('authorization_pending', 'authorization_reconciliation_pending'))
     or (v_row.provider_reference is not null and v_row.state not in ('cancellation_pending', 'cancellation_reconciliation_pending')) then
    return jsonb_build_object('ok', false, 'code', 'state_conflict');
  end if;
  begin
    v_cancelled := public.research_checkout_activation_intent_cancel_v1(
      v_row.member_id, v_row.checkout_idempotency_key_hash,
      v_row.activation_intent_id, v_row.command_id, p_at
    );
    if coalesce((v_cancelled->>'ok')::boolean, false) is not true then raise exception 'activation cancellation refused'; end if;
    v_released := public.research_release_inventory_reservations(
      v_row.member_id, v_row.member_id, v_row.reservation_ids, p_at,
      'checkout-release-v1:' || v_row.command_id::text,
      'Checkout atomic compensation after provider non-capture'
    );
    if v_released->>'action' <> 'release' then raise exception 'inventory release refused'; end if;
    update public.research_checkout_credit_holds set state = 'released', terminal_at = p_at
     where command_id = v_row.command_id and state = 'held';
    update public.research_checkout_commands set
      state = 'rejected', last_reconciliation_phase = null,
      last_provider_code = null, rejected_at = p_at, updated_at = p_at
    where command_id = v_row.command_id;
    insert into public.research_checkout_command_events(command_id, from_state, to_state, event_kind, evidence, occurred_at)
    values (v_row.command_id, v_row.state, 'rejected', 'compensated', jsonb_build_object('reason', p_reason), p_at);
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'state_conflict');
  end;
  return jsonb_build_object('ok', true, 'snapshot', public.research_checkout_command_snapshot_v1(p_command_id), 'idempotent', false);
end;
$function$;

alter table public.research_checkout_commands enable row level security;
alter table public.research_checkout_commands force row level security;
alter table public.research_checkout_credit_holds enable row level security;
alter table public.research_checkout_credit_holds force row level security;
alter table public.research_checkout_credit_spends enable row level security;
alter table public.research_checkout_credit_spends force row level security;
alter table public.research_checkout_command_events enable row level security;
alter table public.research_checkout_command_events force row level security;

revoke all on table public.research_checkout_commands from public, anon, authenticated, service_role;
revoke all on table public.research_checkout_credit_holds from public, anon, authenticated, service_role;
revoke all on table public.research_checkout_credit_spends from public, anon, authenticated, service_role;
revoke all on table public.research_checkout_command_events from public, anon, authenticated, service_role;

revoke all on function public.research_checkout_canonical_json_v1(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.research_checkout_command_snapshot_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.research_checkout_command_find_v1(uuid,text) from public, anon, authenticated;
revoke all on function public.research_checkout_command_begin_v1(jsonb) from public, anon, authenticated;
revoke all on function public.research_checkout_command_record_authorization_v1(uuid,text,bigint,timestamp with time zone) from public, anon, authenticated;
revoke all on function public.research_checkout_command_mark_reconciliation_v1(uuid,text,text,text,timestamp with time zone) from public, anon, authenticated;
revoke all on function public.research_checkout_command_mark_cancellation_pending_v1(uuid,text,timestamp with time zone) from public, anon, authenticated;
revoke all on function public.research_checkout_command_complete_v1(uuid,text,bigint,timestamp with time zone) from public, anon, authenticated;
revoke all on function public.research_checkout_command_compensate_v1(uuid,timestamp with time zone,text) from public, anon, authenticated;

grant execute on function public.research_checkout_command_find_v1(uuid,text) to service_role;
grant execute on function public.research_checkout_command_begin_v1(jsonb) to service_role;
grant execute on function public.research_checkout_command_record_authorization_v1(uuid,text,bigint,timestamp with time zone) to service_role;
grant execute on function public.research_checkout_command_mark_reconciliation_v1(uuid,text,text,text,timestamp with time zone) to service_role;
grant execute on function public.research_checkout_command_mark_cancellation_pending_v1(uuid,text,timestamp with time zone) to service_role;
grant execute on function public.research_checkout_command_complete_v1(uuid,text,bigint,timestamp with time zone) to service_role;
grant execute on function public.research_checkout_command_compensate_v1(uuid,timestamp with time zone,text) to service_role;

comment on table public.research_checkout_commands is
  'UNAPPLIED 2026-08-28 candidate: durable checkout command/saga; provider I/O is external and never inside this transaction.';

commit;
