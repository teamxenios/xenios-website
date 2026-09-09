-- CANDIDATE MIGRATION (not applied; not part of any release until named in an
-- exact-SHA production request and rehearsed on the authorized staging project).
-- Durable checkout executions: the canonical persisted intent behind the
-- recovery-aware coordinator (server/research/commerce/durable-checkout-executor.ts)
-- and the durable receipt for provider webhook evidence
-- (server/research/commerce/webhook-execution-processor.ts).
--
-- Rules encoded here, not in prose:
--   * one execution per (member, request key); the same key with different
--     commercial details is a CONFLICT (the request body digest is bound);
--   * every transition is a version compare-and-swap inside the database, so
--     concurrent retries cannot both own an external effect;
--   * the provider operation keys are minted once with the record and never
--     regenerated; a provider reference, once learned, never changes;
--   * a paid phase requires a provider reference (mirrors research_orders);
--   * committing a capture updates the canonical order, finalizes the
--     execution's reservations, appends the store-credit spend row and stamps
--     the execution committed in ONE transaction. Nothing rolls back an
--     external charge: an uncertain outcome is recorded, never guessed.
--   * service-role only; RLS enabled and forced with no policies.

create table if not exists public.research_checkout_executions (
  id                         uuid primary key default gen_random_uuid(),
  member_id                  uuid not null,
  request_key                text not null check (char_length(request_key) between 8 and 120),
  request_body_sha256        text not null check (request_body_sha256 ~ '^[a-f0-9]{64}$'),
  order_id                   uuid not null references public.research_orders (id),
  phase                      text not null default 'reserved'
                               check (phase in ('reserved','authorizing','action_required','authorized','capturing',
                                                'captured','committed','cancelling','cancelled','reconciliation_required')),
  version                    integer not null default 1 check (version >= 1),
  provider_reference         text null,
  amount_cents               bigint not null check (amount_cents > 0),
  currency                   text not null default 'usd' check (currency = 'usd'),
  payment_method_reference   text not null check (payment_method_reference ~ '^pm_[A-Za-z0-9_]+$'),
  quote_fingerprint          text not null check (char_length(quote_fingerprint) between 1 and 200),
  price_version              text null,
  authorization_key          text not null unique check (char_length(authorization_key) between 8 and 200),
  capture_key                text not null unique check (char_length(capture_key) between 8 and 200),
  cancel_key                 text not null unique check (char_length(cancel_key) between 8 and 200),
  reservation_ids            text[] not null default '{}',
  last_provider_result       jsonb null,
  -- Stamped by the FIRST claim of the authorizing phase and never moved: a
  -- creation replay with the stable key is only safe inside the provider's
  -- idempotency retention measured from this moment.
  authorization_first_attempted_at timestamptz null,
  -- Set when capture evidence exists but the local commit could not complete
  -- (for example an incomplete reservation set). The external charge stands;
  -- the execution waits in reconciliation_required and is never fulfilled.
  local_commit_failure       text null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  committed_at               timestamptz null,
  settled_at                 timestamptz null,
  unique (member_id, request_key),
  constraint research_checkout_executions_paid_needs_reference
    check (phase not in ('authorized','capturing','captured','committed') or provider_reference is not null)
);
create unique index if not exists research_checkout_executions_provider_reference_idx
  on public.research_checkout_executions (provider_reference) where provider_reference is not null;
create index if not exists research_checkout_executions_order_idx
  on public.research_checkout_executions (order_id);

-- Provider events already verified by signature: the durable receipt that is
-- claimed BEFORE any effect and acknowledged to the provider only from a
-- terminal state. The same event id with other bytes is a conflict.
create table if not exists public.research_payment_webhook_inbox (
  provider_name   text not null,
  event_id        text not null,
  event_type      text not null,
  payload_sha256  text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  state           text not null default 'processing' check (state in ('processing','processed','isolated')),
  outcome         text null,
  reason          text null,
  execution_id    uuid null references public.research_checkout_executions (id),
  received_at     timestamptz not null default now(),
  completed_at    timestamptz null,
  primary key (provider_name, event_id)
);

-- Identity never changes after insert: a retry can only move phase/version/evidence.
create or replace function public.research_checkout_executions_immutable()
returns trigger language plpgsql as $$
begin
  if new.member_id is distinct from old.member_id
     or new.request_key is distinct from old.request_key
     or new.request_body_sha256 is distinct from old.request_body_sha256
     or new.order_id is distinct from old.order_id
     or new.amount_cents is distinct from old.amount_cents
     or new.currency is distinct from old.currency
     or new.payment_method_reference is distinct from old.payment_method_reference
     or new.quote_fingerprint is distinct from old.quote_fingerprint
     or new.authorization_key is distinct from old.authorization_key
     or new.capture_key is distinct from old.capture_key
     or new.cancel_key is distinct from old.cancel_key
     or new.price_version is distinct from old.price_version
     or new.reservation_ids is distinct from old.reservation_ids
     or (old.provider_reference is not null and new.provider_reference is distinct from old.provider_reference)
     or (old.authorization_first_attempted_at is not null
         and new.authorization_first_attempted_at is distinct from old.authorization_first_attempted_at) then
    raise exception 'research_checkout_executions: execution identity is immutable';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists research_checkout_executions_immutable on public.research_checkout_executions;
create trigger research_checkout_executions_immutable
  before update on public.research_checkout_executions
  for each row execute function public.research_checkout_executions_immutable();

alter table public.research_checkout_executions enable row level security;
alter table public.research_payment_webhook_inbox enable row level security;
alter table public.research_checkout_executions force row level security;
alter table public.research_payment_webhook_inbox force row level security;
revoke all on table public.research_checkout_executions, public.research_payment_webhook_inbox
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.research_checkout_executions, public.research_payment_webhook_inbox
  to service_role;
revoke all on function public.research_checkout_executions_immutable() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Transitions. Each is a single UPDATE guarded by the expected version; zero
-- rows means another worker moved first and the caller must re-read.
-- ---------------------------------------------------------------------------

create or replace function public.research_checkout_execution_claim(
  p_execution_id uuid,
  p_expected_version integer,
  p_phase text
) returns setof public.research_checkout_executions language plpgsql as $$
begin
  if p_phase not in ('authorizing','capturing','cancelling') then
    raise exception 'research_checkout_execution_claim: % is not a claimable phase', p_phase;
  end if;
  return query
    update public.research_checkout_executions
       set phase = p_phase,
           version = version + 1,
           authorization_first_attempted_at = case
             when p_phase = 'authorizing' then coalesce(authorization_first_attempted_at, now())
             else authorization_first_attempted_at end
     where id = p_execution_id and version = p_expected_version
     returning *;
end $$;

-- Provider evidence lands as the coordinator's ProviderExecutionResult JSON.
-- The phase follows the evidence kind; unknown and refused stop for
-- reconciliation. A reference is learned once and may never change.
create or replace function public.research_checkout_execution_record_provider(
  p_execution_id uuid,
  p_expected_version integer,
  p_result jsonb
) returns setof public.research_checkout_executions language plpgsql as $$
declare
  v_kind text := p_result->>'kind';
  v_reference text := p_result->>'providerReference';
  v_phase text;
begin
  v_phase := case v_kind
    when 'authorized' then 'authorized'
    when 'captured' then 'captured'
    when 'action_required' then 'action_required'
    when 'cancelled' then 'cancelled'
    when 'refused' then 'reconciliation_required'
    when 'unknown' then 'reconciliation_required'
    else null end;
  if v_phase is null then
    raise exception 'research_checkout_execution_record_provider: unknown result kind %', coalesce(v_kind, '<none>');
  end if;
  return query
    update public.research_checkout_executions e
       set phase = v_phase,
           version = e.version + 1,
           provider_reference = coalesce(e.provider_reference, v_reference),
           last_provider_result = p_result
     where e.id = p_execution_id
       and e.version = p_expected_version
       and (e.provider_reference is null or v_reference is null or e.provider_reference = v_reference)
     returning e.*;
end $$;

-- ONE transaction: canonical order becomes payment_captured with the provider
-- evidence, the execution's reservations finalize, store credit applied to the
-- order is spent as an append-only ledger row (exactly once per order), the
-- state trail is appended, and the execution is stamped committed.
create or replace function public.research_checkout_execution_commit_captured(
  p_execution_id uuid,
  p_expected_version integer,
  p_at timestamptz
) returns setof public.research_checkout_executions language plpgsql as $$
declare
  v_exec public.research_checkout_executions%rowtype;
  v_order public.research_orders%rowtype;
begin
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

  -- Mirrors the application's spend row (store-credit-store.ts buildSpendRow):
  -- negative approved amount, adjustment-shaped reason, the order as actor_id.
  if v_order.store_credit_applied_cents > 0 and not exists (
    select 1 from public.research_store_credit_ledger
     where member_id = v_exec.member_id and actor_id = v_order.id::text and amount_cents < 0
  ) then
    insert into public.research_store_credit_ledger
      (member_id, amount_cents, state, reason, available_at, reverses_id, actor_type, actor_id, created_at)
    values
      (v_exec.member_id, -v_order.store_credit_applied_cents, 'approved', 'manual_adjustment', null, null, 'system', v_order.id::text, p_at);
  end if;

  return query
    update public.research_checkout_executions
       set phase = 'committed', version = version + 1, committed_at = coalesce(committed_at, p_at), local_commit_failure = null
     where id = p_execution_id and version = p_expected_version
     returning *;
end $$;

-- After independently verified cancellation with no capture: release the
-- execution's holds and cancel the canonical order, once.
create or replace function public.research_checkout_execution_commit_cancelled(
  p_execution_id uuid,
  p_expected_version integer,
  p_at timestamptz
) returns setof public.research_checkout_executions language plpgsql as $$
declare
  v_exec public.research_checkout_executions%rowtype;
  v_order public.research_orders%rowtype;
begin
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

  return query
    update public.research_checkout_executions
       set version = version + 1, settled_at = p_at
     where id = p_execution_id and version = p_expected_version
     returning *;
end $$;

revoke execute on function public.research_checkout_execution_claim(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.research_checkout_execution_record_provider(uuid, integer, jsonb) from public, anon, authenticated;
revoke execute on function public.research_checkout_execution_commit_captured(uuid, integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.research_checkout_execution_commit_cancelled(uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.research_checkout_execution_claim(uuid, integer, text) to service_role;
grant execute on function public.research_checkout_execution_record_provider(uuid, integer, jsonb) to service_role;
grant execute on function public.research_checkout_execution_commit_captured(uuid, integer, timestamptz) to service_role;
grant execute on function public.research_checkout_execution_commit_cancelled(uuid, integer, timestamptz) to service_role;

comment on table public.research_checkout_executions is
  'Durable checkout executions: one persisted intent per (member, request key) with version-CAS transitions and provider evidence.';
comment on table public.research_payment_webhook_inbox is
  'Signature-verified provider events claimed before any effect and acknowledged only from a terminal state.';
