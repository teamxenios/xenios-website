-- Xenios Research Early Access payment rejection (the review's other half).
--
-- WHY THIS MIGRATION EXISTS.
--
-- The commerce schema can verify a payment and can do nothing else with one.
-- The domain has always had two decisions (approve, reject), the placement
-- state vocabulary has carried 'payment_rejected' since the tables were
-- created, and the application's verification service refuses to approve over
-- a rejection. But no routine could RECORD a rejection: the one
-- research_early_access_verifications row per order is written by the
-- settlement (order_number is its PRIMARY KEY), so the rejection had nowhere
-- to live and the admin door for it could not exist. An operator who could
-- not verify a transfer had no durable way to say so, and the customer whose
-- confirmation was unreadable waited forever.
--
-- WHAT THIS ADDS, AND WHAT IT REFUSES TO TOUCH.
--
--   1. An append-only rejections table. Rejections are HISTORY, not a slot:
--      a customer may resubmit and be rejected again, and each decision is a
--      row. The settlement's one-row verification table is NOT modified, and
--      research_early_access_commit_settlement is NOT touched: the money path
--      that has settled real production orders stays byte-identical.
--   2. research_early_access_commit_rejection: refuses an unknown order,
--      refuses a settled order (rejecting arrived-and-verified money is a
--      refund conversation, not a review outcome), reports a replayed
--      idempotency key as replayed rather than deciding twice, appends the
--      entry, and moves the placement to payment_rejected.
--   3. research_early_access_verifications (the READ) now unions the
--      rejection history with the settlement's verification, ordered by
--      decision time, so the application's decision history is complete and
--      the domain's approve-over-rejection guard can actually see rejections.
--   4. research_early_access_commit_proof gains ONE transition: a fresh proof
--      moves payment_rejected back to under_review, exactly as it moves
--      awaiting_payment. A new submission is what a rejection asks for, and
--      without this the rejected order would be stranded outside the review
--      queue no matter what the customer uploaded. Every other line of that
--      function is byte-identical to the applied version.
--
-- ROLLBACK. Drop the two new/changed routines' additions by re-applying the
-- prior definitions (the commit_proof and verifications bodies in
-- 20260804121000_research_early_access_commerce_persistence.sql), drop
-- research_early_access_commit_rejection, and drop the rejections table.
-- Nothing here writes to any pre-existing table except the placement state
-- column it exists to move.

begin;

-- ---------------------------------------------------------------------------
-- Preflight. Fail closed on any schema that is not the accepted one.
-- ---------------------------------------------------------------------------

do $rejection_preflight$
declare
  v_table text;
begin
  foreach v_table in array array[
    'research_early_access_placements',
    'research_early_access_payment_proofs',
    'research_early_access_verifications',
    'research_early_access_settlements',
    'research_early_access_reservations',
    'research_early_access_admin_exceptions'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception
        'payment rejection requires the accepted commerce schema; public.% is absent', v_table
        using errcode = '55000';
    end if;
  end loop;

  if to_regclass('public.research_early_access_rejections') is not null then
    raise exception
      'public.research_early_access_rejections already exists; refusing to guess its shape'
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'research_early_access_commit_proof'
  ) then
    raise exception 'payment rejection requires research_early_access_commit_proof'
      using errcode = '55000';
  end if;
end;
$rejection_preflight$;

-- ---------------------------------------------------------------------------
-- The append-only rejection history. Same revoke boundary as every commerce
-- table: no direct role access, routines are the only way in.
-- ---------------------------------------------------------------------------

create table public.research_early_access_rejections (
  id bigint generated always as identity primary key,
  order_number text not null
    references public.research_early_access_placements (order_number),
  idempotency_key text not null,
  actor_id text not null,
  decided_at timestamptz not null,
  record jsonb not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_early_access_rejections_decision_agrees
    check (record ->> 'decision' = 'reject'),
  constraint research_early_access_rejections_key_unique
    unique (order_number, idempotency_key)
);

create index research_early_access_rejections_order_idx
  on public.research_early_access_rejections (order_number, decided_at);

alter table public.research_early_access_rejections enable row level security;
alter table public.research_early_access_rejections force row level security;
revoke all on table public.research_early_access_rejections from public;
do $revokes$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.research_early_access_rejections from %I', r);
    end if;
  end loop;
end;
$revokes$;

-- ---------------------------------------------------------------------------
-- Record one rejection.
-- ---------------------------------------------------------------------------

create or replace function public.research_early_access_commit_rejection(
  p_rejection jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $commit_rejection$
declare
  v_order_number text;
  v_key text;
begin
  if p_rejection is null or jsonb_typeof(p_rejection) <> 'object' then
    raise exception 'research_early_access_commit_rejection: rejection must be a jsonb object';
  end if;
  if p_rejection ->> 'decision' is distinct from 'reject' then
    raise exception 'research_early_access_commit_rejection: decision must be reject';
  end if;
  v_order_number := p_rejection ->> 'orderId';
  v_key := p_rejection ->> 'idempotencyKey';
  if v_order_number is null or v_key is null then
    raise exception 'research_early_access_commit_rejection: orderId and idempotencyKey are required';
  end if;

  -- The same serialization the settlement takes: the placement row lock, so a
  -- concurrent confirm and reject of one order resolve in some order rather
  -- than both winning.
  perform 1
  from public.research_early_access_placements
  where order_number = v_order_number
  for update;
  if not found then
    return jsonb_build_object('committed', false, 'reason', 'order_unknown');
  end if;

  if exists (
    select 1 from public.research_early_access_settlements
    where order_number = v_order_number
  ) then
    return jsonb_build_object('committed', false, 'reason', 'already_settled');
  end if;

  if exists (
    select 1 from public.research_early_access_rejections
    where order_number = v_order_number and idempotency_key = v_key
  ) then
    return jsonb_build_object('committed', true, 'replayed', true);
  end if;

  insert into public.research_early_access_rejections
    (order_number, idempotency_key, actor_id, decided_at, record)
  values (
    v_order_number,
    v_key,
    p_rejection ->> 'actorId',
    (p_rejection ->> 'decidedAt')::timestamptz,
    p_rejection
  );

  update public.research_early_access_placements
  set payment_state = 'payment_rejected',
      record = jsonb_set(record, '{paymentState}', to_jsonb('payment_rejected'::text)),
      updated_at = pg_catalog.clock_timestamp()
  where order_number = v_order_number;

  return jsonb_build_object('committed', true, 'replayed', false);
end;
$commit_rejection$;

-- ---------------------------------------------------------------------------
-- The decision history read: rejections plus the settlement's verification.
-- ---------------------------------------------------------------------------

create or replace function public.research_early_access_verifications(
  p_order_number text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $verifications$
  select coalesce(jsonb_agg(record order by decided_at), '[]'::jsonb)
  from (
    select record, decided_at
    from public.research_early_access_rejections
    where order_number = p_order_number
    union all
    select record, decided_at
    from public.research_early_access_verifications
    where order_number = p_order_number
  ) as decisions;
$verifications$;

-- ---------------------------------------------------------------------------
-- The one commit_proof transition. Byte-identical to the applied function
-- except the state test: payment_rejected re-enters review on a fresh proof.
-- ---------------------------------------------------------------------------

create or replace function public.research_early_access_commit_proof(
  p_intake jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $commit_proof$
declare
  v_order_number text;
  v_record jsonb;
  v_state text;
  v_chain_length integer;
  v_reservation_expired boolean;
begin
  if p_intake is null or jsonb_typeof(p_intake) <> 'object' then
    raise exception 'research_early_access_commit_proof: intake must be a jsonb object';
  end if;
  v_order_number := p_intake ->> 'orderNumber';
  v_record := p_intake -> 'record';

  select payment_state into v_state
  from public.research_early_access_placements
  where order_number = v_order_number
  for update;
  if not found then
    return jsonb_build_object('committed', false, 'reason', 'order_unknown');
  end if;

  select count(*) into v_chain_length
  from public.research_early_access_payment_proofs
  where order_number = v_order_number;

  if (v_record ->> 'sequence')::integer <> v_chain_length + 1 then
    return jsonb_build_object('committed', false, 'reason', 'chain_moved');
  end if;

  begin
    insert into public.research_early_access_payment_proofs
      (proof_id, order_number, sequence, storage_ref, sha256, received_at, record)
    values (
      v_record ->> 'proofId',
      v_order_number,
      (v_record ->> 'sequence')::integer,
      v_record ->> 'storageRef',
      p_intake ->> 'sha256',
      (p_intake ->> 'receivedAt')::timestamptz,
      p_intake
    );
  exception
    when unique_violation then
      return jsonb_build_object('committed', false, 'reason', 'proof_id_taken');
  end;

  -- A proof moves the order to review and NEVER past it. A REJECTED order
  -- re-enters review the same way: the fresh submission is exactly the action
  -- the rejection asked for.
  if v_state = 'awaiting_payment' or v_state = 'payment_rejected' then
    update public.research_early_access_placements
    set payment_state = 'under_review',
        record = jsonb_set(record, '{paymentState}', to_jsonb('under_review'::text)),
        updated_at = pg_catalog.clock_timestamp()
    where order_number = v_order_number;
  end if;

  -- Money submitted after the reservation lapsed is a human decision, never
  -- an automatic one. The exception row is raised at most once per order.
  select exists (
    select 1 from public.research_early_access_reservations
    where order_number = v_order_number
      and expires_at is not null
      and expires_at < (p_intake ->> 'receivedAt')::timestamptz
  ) into v_reservation_expired;
  if v_reservation_expired then
    insert into public.research_early_access_admin_exceptions (kind, order_number, detail)
    values (
      'reservation_expired_after_payment_submission',
      v_order_number,
      jsonb_build_object(
        'proofId', v_record ->> 'proofId',
        'receivedAt', p_intake ->> 'receivedAt'
      )
    )
    on conflict (kind, order_number) do nothing;
  end if;

  return jsonb_build_object('committed', true, 'intake', p_intake);
end;
$commit_proof$;

-- ---------------------------------------------------------------------------
-- Privileges: service_role alone, exactly like every other commerce routine.
-- ---------------------------------------------------------------------------

revoke all on function public.research_early_access_commit_rejection(jsonb)
  from public;
do $grants$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format(
        'revoke all on function public.research_early_access_commit_rejection(jsonb) from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.research_early_access_commit_rejection(jsonb)
      to service_role;
  end if;
end;
$grants$;

-- ---------------------------------------------------------------------------
-- Post-condition. The migration proves its own effect and its own boundary.
-- ---------------------------------------------------------------------------

do $rejection_postcondition$
declare
  v_oid oid;
  v_role text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'research_early_access_commit_rejection'
    and p.pronargs = 1;
  if v_oid is null then
    raise exception 'post-condition: commit_rejection was not created' using errcode = '55000';
  end if;
  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'post-condition: commit_rejection must be SECURITY DEFINER' using errcode = '55000';
  end if;

  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role)
       and has_function_privilege(v_role, v_oid, 'EXECUTE') then
      raise exception 'post-condition: % may execute commit_rejection', v_role
        using errcode = '55000';
    end if;
  end loop;

  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = v_role)
       and has_table_privilege(v_role, 'public.research_early_access_rejections', 'SELECT') then
      raise exception 'post-condition: % has direct SELECT on the rejections table', v_role
        using errcode = '55000';
    end if;
  end loop;
end;
$rejection_postcondition$;

commit;
