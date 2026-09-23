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
  add constraint research_payment_webhook_inbox_refund_execution_fk
  foreign key (refund_execution_id) references public.research_refund_executions(id);

-- Final shared-inbox terminal writer. Candidate 1 creates the exact signature
-- while refund bindings are unavailable; this replacement admits either one
-- checkout execution OR one refund execution after the FK exists.
create or replace function public.research_payment_webhook_inbox_terminalize(
  p_provider_name text,
  p_event_id text,
  p_payload_sha256 text,
  p_terminal_state text,
  p_outcome text,
  p_reason text,
  p_execution_id uuid,
  p_refund_execution_id uuid
) returns setof public.research_payment_webhook_inbox
language plpgsql security definer set search_path = '' as $$
declare v_row public.research_payment_webhook_inbox%rowtype;
begin
  if p_provider_name is null or p_event_id is null or p_payload_sha256 is null
     or p_payload_sha256 !~ '^[a-f0-9]{64}$'
     or num_nonnulls(p_execution_id,p_refund_execution_id) > 1
     or (p_terminal_state='processed' and p_outcome='applied'
       and num_nonnulls(p_execution_id,p_refund_execution_id) <> 1)
     or not (
       (p_terminal_state='processed' and p_outcome in ('applied','acknowledged') and p_reason is null)
       or
       (p_terminal_state='isolated' and p_outcome='isolated' and p_reason is not null
         and char_length(p_reason) between 1 and 500)
     ) then
    raise exception 'research_payment_webhook_inbox_invalid_terminal_transition';
  end if;
  select * into v_row from public.research_payment_webhook_inbox
   where provider_name=p_provider_name and event_id=p_event_id for update;
  if not found then raise exception 'research_payment_webhook_inbox_claim_missing'; end if;
  if v_row.payload_sha256 <> p_payload_sha256 then
    raise exception 'research_payment_webhook_inbox_digest_conflict';
  end if;
  if v_row.state in ('processed','isolated') then
    if v_row.state is distinct from p_terminal_state or v_row.outcome is distinct from p_outcome
       or v_row.reason is distinct from p_reason or v_row.execution_id is distinct from p_execution_id
       or v_row.refund_execution_id is distinct from p_refund_execution_id then
      raise exception 'research_payment_webhook_inbox_terminal_conflict';
    end if;
    return query select * from public.research_payment_webhook_inbox
      where provider_name=p_provider_name and event_id=p_event_id;
    return;
  end if;
  return query update public.research_payment_webhook_inbox
    set state=p_terminal_state, outcome=p_outcome, reason=p_reason,
        execution_id=p_execution_id, refund_execution_id=p_refund_execution_id,
        completed_at=clock_timestamp()
    where provider_name=p_provider_name and event_id=p_event_id and state='processing'
    returning *;
end $$;

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

-- One read-only attestation for the complete checkout money chain. The
-- returned version is positive only when the exact reviewed function bodies,
-- durable relations, mutation guards, and least-privilege posture are all
-- present together. A partial migration therefore keeps checkout closed.
create function public.research_checkout_money_capability()
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_signature text;
  v_expected text;
  v_actual text;
begin
  if pg_catalog.to_regclass('public.research_checkout_executions') is null
     or pg_catalog.to_regclass('public.research_payment_webhook_inbox') is null
     or pg_catalog.to_regclass('public.research_checkout_credit_reservations') is null
     or pg_catalog.to_regclass('public.research_refund_executions') is null
     or pg_catalog.to_regclass('public.research_orders') is null
     or pg_catalog.to_regclass('public.research_order_state_events') is null
     or pg_catalog.to_regclass('public.research_lot_reservations') is null
     or pg_catalog.to_regclass('public.research_store_credit_ledger') is null
     or pg_catalog.to_regclass('public.research_refund_keys') is null
     or pg_catalog.to_regclass('public.research_idempotency_keys') is null then
    return null;
  end if;
  if exists (
    select 1 from (values
      ('public.research_checkout_executions'),
      ('public.research_payment_webhook_inbox'),
      ('public.research_checkout_credit_reservations'),
      ('public.research_refund_executions')
    ) v(name)
    where not coalesce((select c.relrowsecurity and c.relforcerowsecurity
      from pg_catalog.pg_class c where c.oid=pg_catalog.to_regclass(v.name)),false)
  ) then return null; end if;

  for v_signature,v_expected in select * from (values
    ('public.research_checkout_execution_claim(uuid,integer,text)', 'cf1ea11145096dc3a26e7b3462d3d0fd'),
    ('public.research_checkout_execution_record_provider(uuid,integer,jsonb)', '1180967b2e15fbe04362548d35f540bc'),
    ('public.research_checkout_execution_commit_captured(uuid,integer,timestamp with time zone)', '23256ff961e198a7b7412950b842a451'),
    ('public.research_checkout_execution_commit_cancelled(uuid,integer,timestamp with time zone)', '9fb10776d94e93358d5e3bd7f477815c'),
    ('public.research_checkout_executions_list_recoverable(timestamp with time zone,integer,timestamp with time zone,uuid)', 'ce6179514d81c0553e68be2f9e3935d6'),
    ('public.research_checkout_recovery_operation(text,uuid,bigint,jsonb)', '9af6492463c1fddbeea4fec6ed844d09'),
    ('public.research_checkout_credit_reserve()', '9d4835dc085c2fb108abb73c717e078c'),
    ('public.research_checkout_credit_lock_before_insert()', '87820a4af4817789606bb1870b818539'),
    ('public.research_store_credit_protect_reservations()', '1634f82aa22b3f60a68b74508fae82c7'),
    ('public.research_checkout_credit_immutable()', 'bf820db0a634299ede4355adcfa9d2ee'),
    ('public.research_checkout_executions_immutable()', '3a6ddd59e10e526eab72c514661c3fff'),
    ('public.research_payment_webhook_inbox_immutable()', 'dedadd08977a958a9535a4764dc849fe'),
    ('public.research_payment_webhook_inbox_claim(text,text,text,text,timestamp with time zone)', 'f9116fb43f8c11e79451ae82124cb571'),
    ('public.research_payment_webhook_inbox_terminalize(text,text,text,text,text,text,uuid,uuid)', 'dc3c6c5ec70dfb72caaad473571a3444'),
    ('public.research_refund_execution_immutable()', '7e327775435c8ea7b246b11d0a8c9039'),
    ('public.research_refund_active_claim_guard()', 'bf3ea0752b3864100198a9cc34097c02'),
    ('public.research_refund_active_order_guard()', 'b63e3024e60f728fd49eb3844bfe869c'),
    ('public.research_refund_execution_prepare(uuid,text,uuid,uuid,text,text,bigint,text,timestamp with time zone)', '2261fea41bd413cdfcd5bc4014b19c21'),
    ('public.research_refund_execution_claim(uuid,integer,timestamp with time zone)', '71861f9d6aa446f15dee8055bb648302'),
    ('public.research_refund_execution_record_provider(uuid,integer,text,text,bigint,text)', 'd1b160cc4011eadbebbae9743ddeeeaf'),
    ('public.research_refund_execution_require_reconciliation(uuid,integer)', '81b597f4c708ade3e7a0f8e43b7e3a2a'),
    ('public.research_refund_execution_commit(uuid,integer)', '00dd7e86985a1b1ef0c1c2bb5663743b')
  ) expected(signature,fingerprint)
  loop
    select pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r\n', E'\n')) into v_actual
      from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure(v_signature);
    if v_actual is null or v_actual <> v_expected then return null; end if;
  end loop;

  -- Function text alone is not authority: ALTER FUNCTION can drift execution
  -- context without changing prosrc. Attest the reviewed attributes and keep
  -- every money RPC owned outside the request-serving roles.
  if exists (select 1 from (values
      ('public.research_payment_webhook_inbox_claim(text,text,text,text,timestamp with time zone)','search_path=""'),
      ('public.research_payment_webhook_inbox_terminalize(text,text,text,text,text,text,uuid,uuid)','search_path=""'),
      ('public.research_refund_execution_prepare(uuid,text,uuid,uuid,text,text,bigint,text,timestamp with time zone)','search_path=pg_catalog, public'),
      ('public.research_refund_execution_claim(uuid,integer,timestamp with time zone)','search_path=pg_catalog, public'),
      ('public.research_refund_execution_record_provider(uuid,integer,text,text,bigint,text)','search_path=pg_catalog, public'),
      ('public.research_refund_execution_require_reconciliation(uuid,integer)','search_path=pg_catalog, public'),
      ('public.research_refund_execution_commit(uuid,integer)','search_path=pg_catalog, public'),
      ('public.research_checkout_money_capability()','search_path=""')
    ) expected(signature,search_path_setting)
    join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(expected.signature)
    where not p.prosecdef
       or p.proowner in ((select oid from pg_catalog.pg_roles where rolname='anon'),
                         (select oid from pg_catalog.pg_roles where rolname='authenticated'),
                         (select oid from pg_catalog.pg_roles where rolname='service_role'))
       or coalesce(pg_catalog.array_length(p.proconfig,1),0) <> 1
       or not expected.search_path_setting=any(p.proconfig)
  ) then return null; end if;

  if exists (select 1 from (values
      ('public.research_checkout_execution_claim(uuid,integer,text)'),
      ('public.research_checkout_execution_record_provider(uuid,integer,jsonb)'),
      ('public.research_checkout_execution_commit_captured(uuid,integer,timestamp with time zone)'),
      ('public.research_checkout_execution_commit_cancelled(uuid,integer,timestamp with time zone)'),
      ('public.research_checkout_executions_list_recoverable(timestamp with time zone,integer,timestamp with time zone,uuid)'),
      ('public.research_checkout_recovery_operation(text,uuid,bigint,jsonb)'),
      ('public.research_checkout_credit_reserve()'),
      ('public.research_checkout_credit_lock_before_insert()'),
      ('public.research_store_credit_protect_reservations()'),
      ('public.research_checkout_credit_immutable()'),
      ('public.research_checkout_executions_immutable()'),
      ('public.research_payment_webhook_inbox_immutable()'),
      ('public.research_refund_execution_immutable()'),
      ('public.research_refund_active_claim_guard()'),
      ('public.research_refund_active_order_guard()')
    ) expected(signature)
    join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(expected.signature)
    where p.prosecdef
       or p.proowner in ((select oid from pg_catalog.pg_roles where rolname='anon'),
                         (select oid from pg_catalog.pg_roles where rolname='authenticated'),
                         (select oid from pg_catalog.pg_roles where rolname='service_role'))
  ) then return null; end if;

  if exists (select 1 from (values
      ('public.research_checkout_executions','research_checkout_executions_immutable','public.research_checkout_executions_immutable()'),
      ('public.research_checkout_executions','research_checkout_credit_reserve','public.research_checkout_credit_reserve()'),
      ('public.research_checkout_executions','research_checkout_credit_lock_before_insert','public.research_checkout_credit_lock_before_insert()'),
      ('public.research_payment_webhook_inbox','research_payment_webhook_inbox_immutable','public.research_payment_webhook_inbox_immutable()'),
      ('public.research_checkout_credit_reservations','research_checkout_credit_immutable','public.research_checkout_credit_immutable()'),
      ('public.research_store_credit_ledger','research_store_credit_protect_reservations','public.research_store_credit_protect_reservations()'),
      ('public.research_claims','research_refund_active_claim_guard','public.research_refund_active_claim_guard()'),
      ('public.research_orders','research_refund_active_order_guard','public.research_refund_active_order_guard()'),
      ('public.research_refund_executions','research_refund_execution_immutable','public.research_refund_execution_immutable()')
    ) required(relation_name,trigger_name,function_name)
    where not exists (select 1 from pg_catalog.pg_trigger t
      where t.tgrelid=pg_catalog.to_regclass(required.relation_name)
        and t.tgname=required.trigger_name
        and t.tgfoid=pg_catalog.to_regprocedure(required.function_name)
        and not t.tgisinternal and t.tgenabled='O')
  ) then return null; end if;

  if not exists (select 1 from pg_catalog.pg_constraint
      where conrelid=pg_catalog.to_regclass('public.research_payment_webhook_inbox')
        and conname='research_payment_webhook_inbox_lifecycle' and contype='c')
     or not exists (select 1 from pg_catalog.pg_constraint
      where conrelid=pg_catalog.to_regclass('public.research_payment_webhook_inbox')
        and conname='research_payment_webhook_inbox_one_binding' and contype='c')
     or not exists (select 1 from pg_catalog.pg_constraint
      where conrelid=pg_catalog.to_regclass('public.research_payment_webhook_inbox')
        and conname='research_payment_webhook_inbox_refund_execution_fk' and contype='f'
        and confrelid=pg_catalog.to_regclass('public.research_refund_executions')) then
    return null;
  end if;

  foreach v_signature in array array[
    'public.research_checkout_execution_claim(uuid,integer,text)',
    'public.research_checkout_execution_record_provider(uuid,integer,jsonb)',
    'public.research_checkout_execution_commit_captured(uuid,integer,timestamp with time zone)',
    'public.research_checkout_execution_commit_cancelled(uuid,integer,timestamp with time zone)',
    'public.research_checkout_executions_list_recoverable(timestamp with time zone,integer,timestamp with time zone,uuid)',
    'public.research_checkout_recovery_operation(text,uuid,bigint,jsonb)',
    'public.research_payment_webhook_inbox_claim(text,text,text,text,timestamp with time zone)',
    'public.research_payment_webhook_inbox_terminalize(text,text,text,text,text,text,uuid,uuid)',
    'public.research_refund_execution_prepare(uuid,text,uuid,uuid,text,text,bigint,text,timestamp with time zone)',
    'public.research_refund_execution_claim(uuid,integer,timestamp with time zone)',
    'public.research_refund_execution_record_provider(uuid,integer,text,text,bigint,text)',
    'public.research_refund_execution_require_reconciliation(uuid,integer)',
    'public.research_refund_execution_commit(uuid,integer)',
    'public.research_checkout_money_capability()'
  ] loop
    if not pg_catalog.has_function_privilege('service_role',v_signature,'EXECUTE')
       or pg_catalog.has_function_privilege('anon',v_signature,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',v_signature,'EXECUTE')
       or exists (select 1 from pg_catalog.pg_proc p,
                    lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
          where p.oid=pg_catalog.to_regprocedure(v_signature)
            and a.grantee=0 and a.privilege_type='EXECUTE') then
      return null;
    end if;
  end loop;

  foreach v_signature in array array[
    'public.research_checkout_credit_reserve()',
    'public.research_checkout_credit_lock_before_insert()',
    'public.research_store_credit_protect_reservations()',
    'public.research_checkout_credit_immutable()',
    'public.research_checkout_executions_immutable()',
    'public.research_payment_webhook_inbox_immutable()',
    'public.research_refund_execution_immutable()',
    'public.research_refund_active_claim_guard()',
    'public.research_refund_active_order_guard()'
  ] loop
    if pg_catalog.has_function_privilege('service_role',v_signature,'EXECUTE')
       or pg_catalog.has_function_privilege('anon',v_signature,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',v_signature,'EXECUTE')
       or exists (select 1 from pg_catalog.pg_proc p,
                    lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
          where p.oid=pg_catalog.to_regprocedure(v_signature)
            and a.grantee=0 and a.privilege_type='EXECUTE') then
      return null;
    end if;
  end loop;

  if exists (select 1 from (values
      ('public.research_checkout_executions'),
      ('public.research_payment_webhook_inbox'),
      ('public.research_checkout_credit_reservations'),
      ('public.research_refund_executions')
    ) required(relation_name),
    (values ('anon'),('authenticated')) exposed(role_name)
    where pg_catalog.has_table_privilege(exposed.role_name,required.relation_name,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) then
    return null;
  end if;

  if pg_catalog.has_table_privilege('service_role','public.research_payment_webhook_inbox','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or pg_catalog.has_table_privilege('service_role','public.research_refund_executions','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or pg_catalog.has_table_privilege('service_role','public.research_checkout_executions','DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or pg_catalog.has_table_privilege('service_role','public.research_checkout_credit_reservations','DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or not pg_catalog.has_table_privilege('service_role','public.research_payment_webhook_inbox','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_refund_executions','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_checkout_executions','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_checkout_executions','INSERT')
     or not pg_catalog.has_table_privilege('service_role','public.research_checkout_executions','UPDATE')
     or not pg_catalog.has_table_privilege('service_role','public.research_checkout_credit_reservations','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_checkout_credit_reservations','INSERT')
     or not pg_catalog.has_table_privilege('service_role','public.research_checkout_credit_reservations','UPDATE')
     or not pg_catalog.has_table_privilege('service_role','public.research_store_credit_ledger','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_store_credit_ledger','INSERT')
     or not pg_catalog.has_table_privilege('service_role','public.research_orders','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_orders','UPDATE')
     or not pg_catalog.has_table_privilege('service_role','public.research_lot_reservations','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_lot_reservations','UPDATE')
     or not pg_catalog.has_table_privilege('service_role','public.research_order_lines','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_order_state_events','INSERT')
     or not pg_catalog.has_table_privilege('service_role','public.research_idempotency_keys','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_idempotency_keys','INSERT')
     or not pg_catalog.has_table_privilege('service_role','public.research_idempotency_keys','UPDATE') then
    return null;
  end if;
  return 'durable_checkout_money_v1:20260922.1';
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
revoke all on function public.research_payment_webhook_inbox_terminalize(text,text,text,text,text,text,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.research_checkout_money_capability() from public, anon, authenticated, service_role;
grant execute on function public.research_refund_execution_prepare(uuid,text,uuid,uuid,text,text,bigint,text,timestamptz) to service_role;
grant execute on function public.research_refund_execution_claim(uuid,integer,timestamptz) to service_role;
grant execute on function public.research_refund_execution_record_provider(uuid,integer,text,text,bigint,text) to service_role;
grant execute on function public.research_refund_execution_require_reconciliation(uuid,integer) to service_role;
grant execute on function public.research_refund_execution_commit(uuid,integer) to service_role;
grant execute on function public.research_payment_webhook_inbox_terminalize(text,text,text,text,text,text,uuid,uuid) to service_role;
grant execute on function public.research_checkout_money_capability() to service_role;

comment on table public.research_refund_executions is
  'Durable refund intents with provider evidence and atomic claim/order completion; service-role reads and RPC-only writes.';
