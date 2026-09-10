-- CANDIDATE ONLY. Generated filename: Supabase CLI migration new, 2026-09-10.
-- Install only after the exact precheck and authorized staging qualification.
-- Ledger rows remain append-only. Reservations encumber an existing balance;
-- they are not grants, ledger `held` entries, or a second balance authority.
-- Transaction lock order: member advisory lock -> execution -> order -> hold.
-- No transaction spans a provider call. Unknown outcomes retain reservations.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- No retrospective holds or guessed reconciliation for already-started credit
-- checkouts. Repeat the decisive precheck under a write-excluding table lock.
lock table public.research_checkout_executions in share row exclusive mode;
do $$ begin
  if exists (select 1 from public.research_checkout_executions e
      join public.research_orders o on o.id = e.order_id
      where o.store_credit_applied_cents > 0 and e.phase <> 'committed'
        and not (e.phase = 'cancelled' and e.settled_at is not null)) then
    raise exception 'credit_existing_unsettled_execution_requires_reconciliation';
  end if;
end $$;

alter table public.research_store_credit_ledger
  add column spend_order_id uuid references public.research_orders(id);
create unique index research_store_credit_ledger_spend_order_idx
  on public.research_store_credit_ledger(spend_order_id)
  where spend_order_id is not null;

create table public.research_checkout_credit_reservations (
  execution_id uuid primary key references public.research_checkout_executions(id),
  order_id uuid not null unique references public.research_orders(id),
  member_id uuid not null,
  amount_cents bigint not null check (amount_cents between 1 and 9007199254740991),
  state text not null default 'held' check (state in ('held','consumed','released')),
  debit_id uuid unique references public.research_store_credit_ledger(id),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint research_checkout_credit_reservations_settlement check (
    (state = 'held' and debit_id is null and settled_at is null)
    or (state = 'consumed' and debit_id is not null and settled_at is not null)
    or (state = 'released' and debit_id is null and settled_at is not null))
);
create index research_checkout_credit_reservations_member_held_idx
  on public.research_checkout_credit_reservations(member_id) where state = 'held';
alter table public.research_checkout_credit_reservations enable row level security;
alter table public.research_checkout_credit_reservations force row level security;
revoke all on table public.research_checkout_credit_reservations from public, anon, authenticated, service_role;
grant select, insert, update on table public.research_checkout_credit_reservations to service_role;
-- Required invoker permissions, explicit rather than relying on provider
-- default privileges. No UPDATE/DELETE permission is added to the ledger.
grant select,insert on table public.research_store_credit_ledger to service_role;
grant select,update on table public.research_orders,public.research_lot_reservations to service_role;
grant select on table public.research_order_lines to service_role;
grant insert on table public.research_order_state_events to service_role;

create function public.research_store_credit_member_lock(p_member_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_member_id is null then raise exception 'credit_member_required'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'credit_contract_requires_read_committed';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('xenios-store-credit:' || p_member_id::text, 0));
end $$;

-- Complete database aggregates, unaffected by PostgREST's row-return cap.
-- `available_at` deliberately does not override the canonical approved state.
create function public.research_store_credit_balance(p_member_id uuid, p_as_of timestamptz)
returns table(spendable_cents bigint, pending_cents bigint, reserved_cents bigint)
language plpgsql security invoker set search_path = '' as $$
declare v_net numeric; v_pending numeric; v_reserved numeric;
begin
  if p_member_id is null or p_as_of is null or not pg_catalog.isfinite(p_as_of) then
    raise exception 'credit_balance_identity_or_clock_invalid';
  end if;
  -- Serialize readers too: no mix of pre-consumption ledger and post-consumption
  -- reservations across the SELECT statements below.
  perform public.research_store_credit_member_lock(p_member_id);
  if exists (select 1 from public.research_store_credit_ledger l where l.member_id = p_member_id
      and (l.amount_cents = 0 or abs(l.amount_cents::numeric) > 9007199254740991
        or not pg_catalog.isfinite(l.created_at)
        or (l.available_at is not null and not pg_catalog.isfinite(l.available_at))
        or (l.expires_at is not null and not pg_catalog.isfinite(l.expires_at)))) then
    raise exception 'credit_ledger_projection_invalid';
  end if;
  select coalesce(sum(l.amount_cents),0) into v_net
    from public.research_store_credit_ledger l where l.member_id = p_member_id
      and l.state = 'approved' and (l.expires_at is null or l.expires_at > p_as_of);
  select coalesce(sum(l.amount_cents),0) into v_pending
    from public.research_store_credit_ledger l where l.member_id = p_member_id
      and l.state in ('pending','held')
      and not exists (select 1 from public.research_store_credit_ledger n
        where n.reverses_id = l.id and n.member_id = p_member_id);
  select coalesce(sum(r.amount_cents),0) into v_reserved
    from public.research_checkout_credit_reservations r where r.member_id = p_member_id and r.state = 'held';
  if abs(v_net) > 9007199254740991 or abs(v_pending) > 9007199254740991
     or v_reserved > 9007199254740991 or abs(v_net - v_reserved) > 9007199254740991 then
    raise exception 'credit_balance_exceeds_exact_integer_capacity';
  end if;
  return query select (v_net-v_reserved)::bigint, v_pending::bigint, v_reserved::bigint;
end $$;

-- New expiring-credit writes are already disabled in the durable adapter.
-- Existing expiring grants must not be converted to immortal debits either.
create function public.research_store_credit_require_nonexpiring(p_member_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.research_store_credit_ledger l
      where l.member_id = p_member_id and l.state = 'approved'
        and l.expires_at is not null and l.expires_at > pg_catalog.clock_timestamp()) then
    raise exception 'credit_expiry_allocation_not_qualified';
  end if;
end $$;

-- AFTER INSERT makes the execution and hold atomic. Unique request-key checks
-- run first, so a retry still reports 23505 and reads its existing execution.
create function public.research_checkout_credit_reserve()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_order public.research_orders%rowtype; v_available bigint;
begin
  perform public.research_store_credit_member_lock(new.member_id);
  select * into v_order from public.research_orders where id = new.order_id for update;
  if not found or v_order.member_id is distinct from new.member_id
     or v_order.total_cents is distinct from new.amount_cents then
    raise exception 'credit_execution_order_identity_mismatch';
  end if;
  if v_order.store_credit_applied_cents = 0 then return new; end if;
  if new.phase <> 'reserved' or new.version <> 1 or new.provider_reference is not null
     or new.committed_at is not null or new.settled_at is not null
     or v_order.state not in ('checkout_pending','manual_review','approved') then
    raise exception 'credit_execution_must_begin_reserved';
  end if;
  perform public.research_store_credit_require_nonexpiring(new.member_id);
  select b.spendable_cents into v_available from public.research_store_credit_balance(new.member_id, pg_catalog.clock_timestamp()) b;
  if v_order.store_credit_applied_cents > v_available then raise exception 'credit_reservation_insufficient'; end if;
  if exists (select 1 from public.research_store_credit_ledger l
      where l.spend_order_id = new.order_id or (l.member_id = new.member_id
        and l.actor_id = new.order_id::text and l.amount_cents < 0)) then
    raise exception 'credit_historical_debit_requires_reconciliation';
  end if;
  insert into public.research_checkout_credit_reservations(execution_id,order_id,member_id,amount_cents)
    values(new.id,new.order_id,new.member_id,v_order.store_credit_applied_cents);
  return new;
end $$;
create trigger research_checkout_credit_reserve after insert on public.research_checkout_executions
  for each row execute function public.research_checkout_credit_reserve();

-- Acquire the member lock BEFORE the execution INSERT can acquire an order FK
-- key-share lock; otherwise a same-order race can invert member/order locking.
create function public.research_checkout_credit_lock_before_insert()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform public.research_store_credit_member_lock(new.member_id);
  return new;
end $$;
create trigger research_checkout_credit_lock_before_insert before insert on public.research_checkout_executions
  for each row execute function public.research_checkout_credit_lock_before_insert();

-- All approved ledger writers serialize with reservations. Administrative
-- debt/reversal semantics stay intact when there is no outstanding hold.
-- A checkout debit may exchange only its own exact hold for ledger consumption.
create function public.research_store_credit_protect_reservations()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_balance record; v_own_hold bigint := 0; v_order public.research_orders%rowtype;
begin
  perform public.research_store_credit_member_lock(new.member_id);
  if new.spend_order_id is not null then
    select * into v_order from public.research_orders where id = new.spend_order_id;
    if not found or v_order.member_id is distinct from new.member_id
       or new.amount_cents is distinct from -v_order.store_credit_applied_cents
       or new.amount_cents >= 0 or new.state <> 'approved' or new.reason <> 'manual_adjustment'
       or new.actor_type <> 'system' or new.actor_id is distinct from new.spend_order_id::text
       or new.reverses_id is not null or new.expires_at is not null or new.available_at is not null then
      raise exception 'credit_spend_identity_mismatch';
    end if;
    select coalesce(sum(r.amount_cents),0) into v_own_hold
      from public.research_checkout_credit_reservations r
      join public.research_checkout_executions e on e.id = r.execution_id
      where r.order_id = new.spend_order_id and r.member_id = new.member_id and r.state = 'held'
        and r.amount_cents = -new.amount_cents and e.phase = 'captured';
    if exists (select 1 from public.research_checkout_executions e where e.order_id = new.spend_order_id)
       and v_own_hold <> -new.amount_cents then raise exception 'credit_checkout_hold_required'; end if;
    if v_own_hold = 0 then perform public.research_store_credit_require_nonexpiring(new.member_id); end if;
  end if;
  if new.state = 'approved' and new.amount_cents < 0
     and (new.expires_at is null or new.expires_at > pg_catalog.clock_timestamp()) then
    select * into v_balance from public.research_store_credit_balance(new.member_id, pg_catalog.clock_timestamp());
    if (v_balance.reserved_cents > 0 or new.spend_order_id is not null)
       and v_balance.spendable_cents::numeric + v_own_hold + new.amount_cents < 0 then
      raise exception 'credit_adjustment_would_invalidate_reservations';
    end if;
  end if;
  return new;
end $$;
create trigger research_store_credit_protect_reservations before insert on public.research_store_credit_ledger
  for each row execute function public.research_store_credit_protect_reservations();

create function public.research_checkout_credit_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'credit_reservation_history_is_preserved'; end if;
  if new.execution_id is distinct from old.execution_id or new.order_id is distinct from old.order_id
     or new.member_id is distinct from old.member_id or new.amount_cents is distinct from old.amount_cents
     or new.created_at is distinct from old.created_at or old.state <> 'held'
     or new.state not in ('consumed','released') then raise exception 'credit_reservation_identity_is_immutable'; end if;
  if new.state = 'consumed' and not exists (
      select 1 from public.research_store_credit_ledger l
      where l.id = new.debit_id and l.member_id = new.member_id and l.spend_order_id = new.order_id
        and l.amount_cents = -new.amount_cents and l.state = 'approved'
        and l.expires_at is null and l.reverses_id is null) then
    raise exception 'credit_consumption_exact_debit_required';
  end if;
  if new.state = 'released' and not exists (
      select 1 from public.research_checkout_executions e
      join public.research_orders o on o.id = e.order_id
      where e.id = new.execution_id and e.phase = 'cancelled' and o.state = 'cancelled'
        and e.last_provider_result->>'capturedAmountCents' = '0') then
    raise exception 'credit_release_verified_cancellation_required';
  end if;
  return new;
end $$;
create trigger research_checkout_credit_immutable before update or delete on public.research_checkout_credit_reservations
  for each row execute function public.research_checkout_credit_immutable();

-- Legacy spending uses the same member-serialized authority. A durable
-- checkout must consume its hold through commit_captured, never through here.
create function public.research_store_credit_spend(p_member_id uuid,p_amount_cents bigint,p_order_id uuid,p_at timestamptz)
returns setof public.research_store_credit_ledger language plpgsql security invoker set search_path = '' as $$
declare v_order public.research_orders%rowtype; v_debit public.research_store_credit_ledger%rowtype; v_available bigint;
begin
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 9007199254740991
     or p_order_id is null or p_at is null or not pg_catalog.isfinite(p_at) then raise exception 'credit_spend_arguments_invalid'; end if;
  perform public.research_store_credit_member_lock(p_member_id);
  select * into v_order from public.research_orders where id = p_order_id for update;
  if not found or v_order.member_id is distinct from p_member_id
     or v_order.store_credit_applied_cents is distinct from p_amount_cents then raise exception 'credit_spend_order_mismatch'; end if;
  if exists (select 1 from public.research_checkout_executions where order_id = p_order_id) then
    raise exception 'credit_checkout_hold_requires_commit';
  end if;
  select * into v_debit from public.research_store_credit_ledger where spend_order_id = p_order_id;
  if found then
    if v_debit.member_id is distinct from p_member_id or v_debit.amount_cents is distinct from -p_amount_cents
       or v_debit.state <> 'approved' or v_debit.expires_at is not null or v_debit.reverses_id is not null then
      raise exception 'credit_spend_replay_mismatch';
    end if;
    return next v_debit; return;
  end if;
  if exists (select 1 from public.research_store_credit_ledger l where l.member_id = p_member_id
      and l.actor_id = p_order_id::text and l.amount_cents < 0) then
    raise exception 'credit_historical_debit_requires_reconciliation';
  end if;
  perform public.research_store_credit_require_nonexpiring(p_member_id);
  select b.spendable_cents into v_available from public.research_store_credit_balance(p_member_id,pg_catalog.clock_timestamp()) b;
  if p_amount_cents > v_available then raise exception 'credit_spend_insufficient'; end if;
  return query insert into public.research_store_credit_ledger
    (member_id,amount_cents,state,reason,available_at,reverses_id,actor_type,actor_id,created_at,expires_at,spend_order_id)
    values(p_member_id,-p_amount_cents,'approved','manual_adjustment',null,null,'system',p_order_id::text,p_at,null,p_order_id) returning *;
end $$;

create or replace function public.research_checkout_execution_commit_captured(
  p_execution_id uuid,
  p_expected_version integer,
  p_at timestamptz
) returns setof public.research_checkout_executions language plpgsql security invoker set search_path = '' as $$
declare
  v_exec public.research_checkout_executions%rowtype;
  v_order public.research_orders%rowtype;
  v_member uuid;
  v_hold public.research_checkout_credit_reservations%rowtype;
  v_debit_id uuid;
begin
  if p_at is null or not pg_catalog.isfinite(p_at) then raise exception 'credit_commit_clock_invalid'; end if;
  -- Read immutable member identity without a row lock, then establish the
  -- shared lock order before acquiring execution/order locks.
  select member_id into v_member from public.research_checkout_executions where id = p_execution_id;
  if not found then return; end if;
  perform public.research_store_credit_member_lock(v_member);
  select * into v_exec from public.research_checkout_executions
   where id = p_execution_id for update;
  if not found or v_exec.version <> p_expected_version then
    return;
  end if;
  if v_exec.phase = 'committed' then
    return query select * from public.research_checkout_executions where id = p_execution_id;
    return;
  end if;
  if v_exec.phase <> 'captured' or v_exec.provider_reference is null then
    raise exception 'research_checkout_execution_commit_captured: execution % is % without capture evidence', p_execution_id, v_exec.phase;
  end if;

  select * into v_order from public.research_orders
   where id = v_exec.order_id and member_id = v_exec.member_id for update;
  if not found then
    raise exception 'research_checkout_execution_commit_captured: order % is not the member''s order', v_exec.order_id;
  end if;
  if v_order.total_cents <> v_exec.amount_cents then
    raise exception 'research_checkout_execution_commit_captured: order total % does not match captured amount %', v_order.total_cents, v_exec.amount_cents;
  end if;
  if v_order.payment_reference is not null and v_order.payment_reference <> v_exec.provider_reference then
    raise exception 'research_checkout_execution_commit_captured: order % already carries another payment reference', v_exec.order_id;
  end if;
  if v_order.state not in ('checkout_pending','payment_authorized','manual_review','approved','payment_captured') then
    raise exception 'research_checkout_execution_commit_captured: order % cannot be captured from %', v_exec.order_id, v_order.state;
  end if;

  -- The complete expected reservation set, validated BEFORE any local effect:
  -- every recorded id must exist for this member and still hold or already be
  -- finalized (an interrupted earlier commit); the held quantities per SKU
  -- must equal the order lines. Anything else is a local-commit failure that
  -- keeps the capture evidence, marks the execution for reconciliation and
  -- touches nothing else. The external charge is never pretended away.
  declare
    v_expected_ids text[] := (select coalesce(array_agg(distinct x), '{}') from unnest(v_exec.reservation_ids) as x);
    v_missing text[];
    v_bad_status text[];
    v_quantity_mismatch boolean;
    v_failure text := null;
  begin
    select coalesce(array_agg(x), '{}') into v_missing
      from unnest(v_expected_ids) as x
     where not exists (select 1 from public.research_lot_reservations r
                        where r.reservation_id = x and r.member_id = v_exec.member_id);
    select coalesce(array_agg(r.reservation_id), '{}') into v_bad_status
      from public.research_lot_reservations r
     where r.reservation_id = any (v_expected_ids)
       and r.member_id = v_exec.member_id
       and r.status not in ('held','finalized');
    select exists (
      select 1 from (
        select l.sku, sum(l.quantity) as line_quantity,
               (select coalesce(sum(r.quantity), 0) from public.research_lot_reservations r
                 where r.reservation_id = any (v_expected_ids) and r.member_id = v_exec.member_id and r.sku = l.sku) as held_quantity
          from public.research_order_lines l where l.order_id = v_order.id group by l.sku
      ) q where q.line_quantity <> q.held_quantity
      union all
      select 1 from public.research_lot_reservations r
       where r.reservation_id = any (v_expected_ids) and r.member_id = v_exec.member_id
         and not exists (select 1 from public.research_order_lines l where l.order_id = v_order.id and l.sku = r.sku)
    ) into v_quantity_mismatch;
    if array_length(v_missing, 1) is not null then
      v_failure := 'reservations_missing:' || array_to_string(v_missing, ',');
    elsif array_length(v_bad_status, 1) is not null then
      v_failure := 'reservations_not_held:' || array_to_string(v_bad_status, ',');
    elsif v_quantity_mismatch then
      v_failure := 'reservation_quantities_differ_from_order_lines';
    elsif array_length(v_expected_ids, 1) is null
      and exists (select 1 from public.research_order_lines l where l.order_id = v_order.id) then
      v_failure := 'no_reservations_for_order_lines';
    end if;
    if v_failure is not null then
      return query
        update public.research_checkout_executions
           set phase = 'reconciliation_required', version = version + 1, local_commit_failure = v_failure
         where id = p_execution_id and version = p_expected_version
         returning *;
      return;
    end if;
  end;

  if v_order.state <> 'payment_captured' then
    update public.research_orders
       set state = 'payment_captured',
           payment_reference = v_exec.provider_reference,
           authorized_amount_cents = coalesce(authorized_amount_cents, v_exec.amount_cents),
           captured_amount_cents = v_exec.amount_cents,
           last_idempotency_key = v_exec.capture_key,
           placed_at = coalesce(placed_at, p_at),
           updated_at = now()
     where id = v_order.id;
    insert into public.research_order_state_events
      (order_id, from_state, to_state, actor_type, actor_id, provider_reference, idempotency_key, occurred_at)
    values
      (v_order.id, v_order.state, 'payment_captured', 'system', 'durable_checkout', v_exec.provider_reference, v_exec.capture_key, p_at);
  end if;

  update public.research_lot_reservations
     set status = 'finalized', finalized_at = coalesce(finalized_at, p_at)
   where reservation_id = any (v_exec.reservation_ids)
     and member_id = v_exec.member_id
     and status = 'held';
  if exists (select 1 from public.research_lot_reservations
              where reservation_id = any (v_exec.reservation_ids) and member_id = v_exec.member_id
                and status <> 'finalized') then
    raise exception 'research_checkout_execution_commit_captured: reservation set changed during commit';
  end if;

  if v_order.store_credit_applied_cents > 0 then
    select * into v_hold from public.research_checkout_credit_reservations where execution_id = v_exec.id for update;
    if not found or v_hold.state <> 'held' or v_hold.member_id <> v_exec.member_id
       or v_hold.order_id <> v_order.id or v_hold.amount_cents <> v_order.store_credit_applied_cents then
      raise exception 'credit_capture_exact_hold_required';
    end if;
    -- Never treat an arbitrary historical negative adjustment as this spend.
    if exists (select 1 from public.research_store_credit_ledger l
        where l.spend_order_id = v_order.id or (l.member_id = v_exec.member_id
          and l.actor_id = v_order.id::text and l.amount_cents < 0)) then
      raise exception 'credit_historical_debit_requires_reconciliation';
    end if;
    insert into public.research_store_credit_ledger
      (member_id,amount_cents,state,reason,available_at,reverses_id,actor_type,actor_id,created_at,expires_at,spend_order_id)
      values(v_exec.member_id,-v_hold.amount_cents,'approved','manual_adjustment',null,null,'system',v_order.id::text,p_at,null,v_order.id)
      returning id into v_debit_id;
    update public.research_checkout_credit_reservations
      set state = 'consumed', debit_id = v_debit_id, settled_at = p_at where execution_id = v_exec.id;
  end if;

  return query
    update public.research_checkout_executions
       set phase = 'committed', version = version + 1, committed_at = coalesce(committed_at, p_at), local_commit_failure = null
     where id = p_execution_id and version = p_expected_version
     returning *;
end $$;

create or replace function public.research_checkout_execution_commit_cancelled(
  p_execution_id uuid,
  p_expected_version integer,
  p_at timestamptz
) returns setof public.research_checkout_executions language plpgsql security invoker set search_path = '' as $$
declare
  v_exec public.research_checkout_executions%rowtype;
  v_order public.research_orders%rowtype;
  v_member uuid;
  v_hold public.research_checkout_credit_reservations%rowtype;
begin
  if p_at is null or not pg_catalog.isfinite(p_at) then raise exception 'credit_commit_clock_invalid'; end if;
  -- Read immutable member identity without a row lock, then establish the
  -- shared lock order before acquiring execution/order locks.
  select member_id into v_member from public.research_checkout_executions where id = p_execution_id;
  if not found then return; end if;
  perform public.research_store_credit_member_lock(v_member);
  select * into v_exec from public.research_checkout_executions
   where id = p_execution_id for update;
  if not found or v_exec.version <> p_expected_version then
    return;
  end if;
  if v_exec.phase <> 'cancelled' then
    raise exception 'research_checkout_execution_commit_cancelled: execution % is %, not cancelled', p_execution_id, v_exec.phase;
  end if;
  if v_exec.settled_at is not null then
    return query select * from public.research_checkout_executions where id = p_execution_id;
    return;
  end if;
  if coalesce((v_exec.last_provider_result->>'capturedAmountCents')::bigint, -1) <> 0 then
    raise exception 'research_checkout_execution_commit_cancelled: execution % lacks zero-capture evidence', p_execution_id;
  end if;

  select * into v_order from public.research_orders
   where id = v_exec.order_id and member_id = v_exec.member_id for update;
  if not found then
    raise exception 'research_checkout_execution_commit_cancelled: order % is not the member''s order', v_exec.order_id;
  end if;
  if v_order.state in ('checkout_pending','payment_authorized','manual_review','approved') then
    update public.research_orders
       set state = 'cancelled', last_idempotency_key = v_exec.cancel_key, updated_at = now()
     where id = v_order.id;
    insert into public.research_order_state_events
      (order_id, from_state, to_state, actor_type, actor_id, provider_reference, idempotency_key, occurred_at)
    values
      (v_order.id, v_order.state, 'cancelled', 'system', 'durable_checkout', v_exec.provider_reference, v_exec.cancel_key, p_at);
  elsif v_order.state <> 'cancelled' then
    raise exception 'research_checkout_execution_commit_cancelled: order % cannot be cancelled from %', v_exec.order_id, v_order.state;
  end if;

  update public.research_lot_reservations
     set status = 'released', released_at = coalesce(released_at, p_at)
   where reservation_id = any (v_exec.reservation_ids)
     and member_id = v_exec.member_id
     and status = 'held';

  if v_order.store_credit_applied_cents > 0 then
    select * into v_hold from public.research_checkout_credit_reservations where execution_id = v_exec.id for update;
    if not found or v_hold.state <> 'held' or v_hold.member_id <> v_exec.member_id
       or v_hold.order_id <> v_order.id or v_hold.amount_cents <> v_order.store_credit_applied_cents then
      raise exception 'credit_cancellation_exact_hold_required';
    end if;
    update public.research_checkout_credit_reservations set state = 'released', settled_at = p_at
      where execution_id = v_exec.id;
  end if;

  return query
    update public.research_checkout_executions
       set version = version + 1, settled_at = p_at
     where id = p_execution_id and version = p_expected_version
     returning *;
end $$;

revoke all on function public.research_store_credit_member_lock(uuid) from public,anon,authenticated,service_role;
revoke all on function public.research_store_credit_balance(uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.research_store_credit_require_nonexpiring(uuid) from public,anon,authenticated,service_role;
revoke all on function public.research_store_credit_spend(uuid,bigint,uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.research_checkout_credit_reserve() from public,anon,authenticated,service_role;
revoke all on function public.research_checkout_credit_lock_before_insert() from public,anon,authenticated,service_role;
revoke all on function public.research_store_credit_protect_reservations() from public,anon,authenticated,service_role;
revoke all on function public.research_checkout_credit_immutable() from public,anon,authenticated,service_role;
grant execute on function public.research_store_credit_member_lock(uuid),
  public.research_store_credit_balance(uuid,timestamptz),
  public.research_store_credit_require_nonexpiring(uuid),
  public.research_store_credit_spend(uuid,bigint,uuid,timestamptz) to service_role;
revoke execute on function public.research_checkout_execution_commit_captured(uuid,integer,timestamptz),
  public.research_checkout_execution_commit_cancelled(uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.research_checkout_execution_commit_captured(uuid,integer,timestamptz),
  public.research_checkout_execution_commit_cancelled(uuid,integer,timestamptz) to service_role;

comment on table public.research_checkout_credit_reservations is
  'Execution-bound credit encumbrances. Ledger remains append-only; unknown provider outcomes never release holds.';
commit;
