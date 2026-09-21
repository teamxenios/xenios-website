-- CANDIDATE ONLY. Unapplied; no production effect.
-- Durable refund intent, provider reconciliation, and atomic local completion.

create table public.research_refund_executions (
  id uuid primary key,
  scope text not null unique check (char_length(scope) between 8 and 200),
  claim_id uuid not null references public.research_claims(id),
  order_id uuid not null references public.research_orders(id),
  admin_id text not null check (char_length(admin_id) between 1 and 200),
  payment_reference text not null check (payment_reference ~ '^pi_[A-Za-z0-9_]+$'),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency = 'usd'),
  state text not null check (state in ('prepared','calling_provider','provider_succeeded','reconciliation_required','committed')),
  version integer not null default 1 check (version >= 1),
  provider_refund_reference text null unique check (provider_refund_reference is null or provider_refund_reference ~ '^re_[A-Za-z0-9_]+$'),
  first_attempted_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  committed_at timestamptz null,
  constraint research_refund_execution_attempt_state check (
    (state = 'prepared') = (first_attempted_at is null)
  ),
  constraint research_refund_execution_provider_evidence check (
    (state in ('provider_succeeded','committed')) = (provider_refund_reference is not null)
  ),
  constraint research_refund_execution_commit_stamp check (
    (state = 'committed') = (committed_at is not null)
  ),
  constraint research_refund_execution_time_order check (
    updated_at >= created_at
    and (first_attempted_at is null or first_attempted_at >= created_at)
    and (committed_at is null or committed_at >= coalesce(first_attempted_at, created_at))
    and (committed_at is null or updated_at >= committed_at)
  )
);

alter table public.research_payment_webhook_inbox
  add column refund_execution_id uuid null references public.research_refund_executions(id);

create unique index research_refund_executions_one_active_claim
  on public.research_refund_executions(claim_id) where state <> 'committed';
create unique index research_refund_executions_one_active_order
  on public.research_refund_executions(order_id) where state <> 'committed';

create function public.research_refund_execution_immutable()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.id is distinct from old.id or new.scope is distinct from old.scope
     or new.claim_id is distinct from old.claim_id or new.order_id is distinct from old.order_id
     or new.admin_id is distinct from old.admin_id or new.payment_reference is distinct from old.payment_reference
     or new.amount_cents is distinct from old.amount_cents or new.currency is distinct from old.currency
     or new.created_at is distinct from old.created_at
     or (old.provider_refund_reference is not null and new.provider_refund_reference is distinct from old.provider_refund_reference)
     or (old.first_attempted_at is not null and new.first_attempted_at is distinct from old.first_attempted_at) then
    raise exception 'research_refund_execution_identity_immutable';
  end if;
  return new;
end $$;
create trigger research_refund_execution_immutable
  before update on public.research_refund_executions
  for each row execute function public.research_refund_execution_immutable();

-- Once intent is persisted, no independent admin/order path may invalidate the
-- authorization while the provider effect is in flight. The commit RPC marks
-- the execution terminal first, in the same transaction, then updates both.
create function public.research_refund_active_claim_guard()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if exists (select 1 from public.research_refund_executions where claim_id = old.id and state <> 'committed') then
    raise exception 'research_refund_execution_claim_locked';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger research_refund_active_claim_guard
  before update or delete on public.research_claims
  for each row execute function public.research_refund_active_claim_guard();

create function public.research_refund_active_order_guard()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if exists (select 1 from public.research_refund_executions where order_id = old.id and state <> 'committed') then
    raise exception 'research_refund_execution_order_locked';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger research_refund_active_order_guard
  before update or delete on public.research_orders
  for each row execute function public.research_refund_active_order_guard();

create function public.research_refund_execution_prepare(
  p_execution_id uuid, p_scope text, p_claim_id uuid, p_order_id uuid,
  p_admin_id text, p_payment_reference text, p_amount_cents bigint,
  p_currency text, p_created_at timestamptz
) returns setof public.research_refund_executions
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_existing public.research_refund_executions%rowtype;
  v_claim public.research_claims%rowtype;
  v_order public.research_orders%rowtype;
begin
  select * into v_existing from public.research_refund_executions where scope = p_scope for update;
  if found then
    if v_existing.claim_id <> p_claim_id or v_existing.order_id <> p_order_id
       or v_existing.admin_id <> p_admin_id or v_existing.payment_reference <> p_payment_reference
       or v_existing.amount_cents <> p_amount_cents or v_existing.currency <> p_currency then
      raise exception 'refund_execution_conflict';
    end if;
    return query select * from public.research_refund_executions where id = v_existing.id;
    return;
  end if;
  if p_scope is null or char_length(p_scope) not between 8 and 200 or p_admin_id is null or p_admin_id = ''
     or p_payment_reference !~ '^pi_[A-Za-z0-9_]+$' or p_amount_cents <= 0 or p_currency <> 'usd'
     or p_created_at is null then
    raise exception 'refund_execution_invalid_intent';
  end if;
  select * into v_claim from public.research_claims where id = p_claim_id for update;
  if not found or v_claim.order_id <> p_order_id or v_claim.state <> 'approved' then
    raise exception 'refund_execution_claim_not_approved';
  end if;
  select * into v_order from public.research_orders where id = p_order_id for update;
  if not found or v_order.payment_reference is distinct from p_payment_reference
     or v_order.state not in ('payment_captured','processing','partially_fulfilled','fulfilled','delivered','exception')
     or v_order.captured_amount_cents is null or v_order.captured_amount_cents <= 0
     or v_order.refunded_cents <> 0 or p_amount_cents > v_order.captured_amount_cents then
    raise exception 'refund_execution_order_not_refundable';
  end if;
  return query
    insert into public.research_refund_executions
      (id, scope, claim_id, order_id, admin_id, payment_reference, amount_cents, currency,
       state, version, created_at, updated_at)
    values
      (p_execution_id, p_scope, p_claim_id, p_order_id, p_admin_id, p_payment_reference,
       p_amount_cents, p_currency, 'prepared', 1, p_created_at, p_created_at)
    returning *;
exception when unique_violation then
  raise exception 'refund_execution_conflict';
end $$;

create function public.research_refund_execution_claim(
  p_execution_id uuid, p_expected_version integer, p_attempted_at timestamptz
) returns setof public.research_refund_executions
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  return query update public.research_refund_executions e
     set state = 'calling_provider', version = e.version + 1,
         first_attempted_at = coalesce(e.first_attempted_at, p_attempted_at), updated_at = p_attempted_at
   where e.id = p_execution_id and e.version = p_expected_version
     and e.state in ('prepared','calling_provider','reconciliation_required')
   returning e.*;
end $$;

create function public.research_refund_execution_record_provider(
  p_execution_id uuid, p_expected_version integer, p_refund_reference text,
  p_payment_reference text, p_amount_cents bigint, p_currency text
) returns setof public.research_refund_executions
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  return query update public.research_refund_executions e
     set state = 'provider_succeeded', version = e.version + 1,
         provider_refund_reference = p_refund_reference, updated_at = now()
   where e.id = p_execution_id and e.version = p_expected_version
     and e.state in ('calling_provider','reconciliation_required')
     and e.payment_reference = p_payment_reference and e.amount_cents = p_amount_cents
     and e.currency = p_currency and p_refund_reference ~ '^re_[A-Za-z0-9_]+$'
   returning e.*;
end $$;

create function public.research_refund_execution_require_reconciliation(
  p_execution_id uuid, p_expected_version integer
) returns setof public.research_refund_executions
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  return query update public.research_refund_executions e
     set state = 'reconciliation_required', version = e.version + 1, updated_at = now()
   where e.id = p_execution_id and e.version = p_expected_version
     and e.state in ('calling_provider','reconciliation_required')
   returning e.*;
end $$;

create function public.research_refund_execution_commit(
  p_execution_id uuid, p_expected_version integer
) returns setof public.research_refund_executions
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_exec public.research_refund_executions%rowtype;
  v_claim public.research_claims%rowtype;
  v_order public.research_orders%rowtype;
begin
  select * into v_exec from public.research_refund_executions where id = p_execution_id for update;
  if not found or v_exec.version <> p_expected_version then return; end if;
  if v_exec.state = 'committed' then
    return query select * from public.research_refund_executions where id = p_execution_id;
    return;
  end if;
  if v_exec.state <> 'provider_succeeded' or v_exec.provider_refund_reference is null then
    raise exception 'refund_execution_missing_provider_evidence';
  end if;
  select * into v_claim from public.research_claims where id = v_exec.claim_id for update;
  select * into v_order from public.research_orders where id = v_exec.order_id for update;
  if v_claim.id is null or v_claim.order_id <> v_exec.order_id or v_claim.state <> 'approved' then
    raise exception 'refund_execution_claim_changed';
  end if;
  if v_order.id is null or v_order.payment_reference is distinct from v_exec.payment_reference
     or v_order.state not in ('payment_captured','processing','partially_fulfilled','fulfilled','delivered','exception')
     or v_order.captured_amount_cents is null or v_order.refunded_cents <> 0
     or v_exec.amount_cents > v_order.captured_amount_cents then
    raise exception 'refund_execution_order_changed';
  end if;
  if exists (select 1 from public.research_refund_keys where scope = v_exec.scope
             and refund_reference <> v_exec.provider_refund_reference) then
    raise exception 'refund_execution_ledger_conflict';
  end if;

  -- Terminal first, so the two guard triggers permit only these same-transaction updates.
  update public.research_refund_executions
     set state = 'committed', version = version + 1, committed_at = now(), updated_at = now()
   where id = v_exec.id and version = p_expected_version;
  insert into public.research_refund_keys(scope, refund_reference)
    values (v_exec.scope, v_exec.provider_refund_reference) on conflict (scope) do nothing;
  update public.research_orders
     set state = 'refunded', refunded_cents = v_exec.amount_cents,
         last_idempotency_key = v_exec.scope, updated_at = now()
   where id = v_exec.order_id;
  update public.research_claims
     set state = 'resolved',
         resolution = case when v_exec.amount_cents = v_order.captured_amount_cents then 'refund' else 'partial_refund' end,
         reviewed_by = v_exec.admin_id, updated_at = now()
   where id = v_exec.claim_id;
  insert into public.research_order_state_events
    (order_id, from_state, to_state, actor_type, actor_id, provider_reference, idempotency_key, occurred_at)
  values
    (v_exec.order_id, v_order.state, 'refunded', 'admin', v_exec.admin_id,
     v_exec.provider_refund_reference, v_exec.scope, now());
  return query select * from public.research_refund_executions where id = v_exec.id;
end $$;

alter table public.research_refund_executions enable row level security;
alter table public.research_refund_executions force row level security;
revoke all on table public.research_refund_executions from public, anon, authenticated, service_role;
grant select on table public.research_refund_executions to service_role;

revoke all on function public.research_refund_execution_immutable() from public, anon, authenticated, service_role;
revoke all on function public.research_refund_active_claim_guard() from public, anon, authenticated, service_role;
revoke all on function public.research_refund_active_order_guard() from public, anon, authenticated, service_role;
revoke all on function public.research_refund_execution_prepare(uuid,text,uuid,uuid,text,text,bigint,text,timestamptz) from public, anon, authenticated;
revoke all on function public.research_refund_execution_claim(uuid,integer,timestamptz) from public, anon, authenticated;
revoke all on function public.research_refund_execution_record_provider(uuid,integer,text,text,bigint,text) from public, anon, authenticated;
revoke all on function public.research_refund_execution_require_reconciliation(uuid,integer) from public, anon, authenticated;
revoke all on function public.research_refund_execution_commit(uuid,integer) from public, anon, authenticated;
grant execute on function public.research_refund_execution_prepare(uuid,text,uuid,uuid,text,text,bigint,text,timestamptz) to service_role;
grant execute on function public.research_refund_execution_claim(uuid,integer,timestamptz) to service_role;
grant execute on function public.research_refund_execution_record_provider(uuid,integer,text,text,bigint,text) to service_role;
grant execute on function public.research_refund_execution_require_reconciliation(uuid,integer) to service_role;
grant execute on function public.research_refund_execution_commit(uuid,integer) to service_role;

comment on table public.research_refund_executions is
  'Durable refund intents with provider evidence and atomic claim/order completion; service-role reads and RPC-only writes.';
