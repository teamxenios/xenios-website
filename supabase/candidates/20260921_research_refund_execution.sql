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
     or pg_catalog.to_regclass('public.research_lot_reservation_allocations') is null
     or pg_catalog.to_regclass('public.research_inventory_lots') is null
     or pg_catalog.to_regclass('public.research_inventory_reservation_events') is null
     or pg_catalog.to_regclass('public.research_store_credit_ledger') is null
     or pg_catalog.to_regclass('public.research_refund_keys') is null
     or pg_catalog.to_regclass('public.research_idempotency_keys') is null then
    return null;
  end if;
  -- Pin every relation used by the money boundary to the reviewed namespace,
  -- physical kind, owner and RLS posture. Negative owner lists are not enough:
  -- an arbitrary role must not be able to replace postgres as the authority.
  if exists (
    select 1
      from (values
        ('public.research_checkout_executions',true,true),
        ('public.research_payment_webhook_inbox',true,true),
        ('public.research_checkout_credit_reservations',true,true),
        ('public.research_refund_executions',true,true),
        ('public.research_orders',true,false),
        ('public.research_order_lines',true,false),
        ('public.research_order_state_events',true,false),
        ('public.research_claims',true,false),
        ('public.research_lot_reservations',true,true),
        ('public.research_lot_reservation_allocations',true,true),
        ('public.research_inventory_lots',true,true),
        ('public.research_inventory_reservation_events',true,true),
        ('public.research_store_credit_ledger',true,false),
        ('public.research_refund_keys',true,false),
        ('public.research_idempotency_keys',true,false)
      ) required(relation_name,row_security,force_row_security)
      left join pg_catalog.pg_class c
        on c.oid=pg_catalog.to_regclass(required.relation_name)
      left join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      left join pg_catalog.pg_roles owner_role on owner_role.oid=c.relowner
     where c.oid is null or n.nspname <> 'public' or c.relkind <> 'r'
        or owner_role.rolname <> 'postgres'
        or c.relrowsecurity is distinct from required.row_security
        or c.relforcerowsecurity is distinct from required.force_row_security
  ) then return null; end if;

  -- Critical column identity is catalog data, not just a name/type hint. Pin
  -- nullability and default presence for values whose absence changes money
  -- semantics, while avoiding version-dependent deparsed default strings.
  if exists (
    select 1
      from (values
        ('public.research_checkout_executions','id','uuid',true,true),
        ('public.research_checkout_executions','member_id','uuid',true,false),
        ('public.research_checkout_executions','request_key','text',true,false),
        ('public.research_checkout_executions','request_body_sha256','text',true,false),
        ('public.research_checkout_executions','order_id','uuid',true,false),
        ('public.research_checkout_executions','provider_reference','text',false,false),
        ('public.research_checkout_executions','currency','text',true,true),
        ('public.research_checkout_executions','authorization_key','text',true,false),
        ('public.research_checkout_executions','capture_key','text',true,false),
        ('public.research_checkout_executions','cancel_key','text',true,false),
        ('public.research_checkout_executions','reservation_ids','text[]',true,true),
        ('public.research_payment_webhook_inbox','provider_name','text',true,false),
        ('public.research_payment_webhook_inbox','event_id','text',true,false),
        ('public.research_payment_webhook_inbox','execution_id','uuid',false,false),
        ('public.research_payment_webhook_inbox','refund_execution_id','uuid',false,false),
        ('public.research_checkout_credit_reservations','execution_id','uuid',true,false),
        ('public.research_checkout_credit_reservations','order_id','uuid',true,false),
        ('public.research_checkout_credit_reservations','member_id','uuid',true,false),
        ('public.research_checkout_credit_reservations','amount_cents','bigint',true,false),
        ('public.research_checkout_credit_reservations','state','text',true,true),
        ('public.research_checkout_credit_reservations','debit_id','uuid',false,false),
        ('public.research_lot_reservations','reservation_id','text',true,false),
        ('public.research_lot_reservations','member_id','uuid',true,false),
        ('public.research_lot_reservations','quantity','integer',true,false),
        ('public.research_lot_reservations','status','text',true,true),
        ('public.research_lot_reservations','version','bigint',true,true),
        ('public.research_lot_reservation_allocations','lot_uuid','uuid',true,false),
        ('public.research_lot_reservation_allocations','quantity','integer',true,false),
        ('public.research_lot_reservation_allocations','resulting_lot_version','bigint',true,false),
        ('public.research_refund_executions','id','uuid',true,false),
        ('public.research_refund_executions','order_id','uuid',true,false),
        ('public.research_refund_executions','claim_id','uuid',true,false),
        ('public.research_refund_executions','scope','text',true,false),
        ('public.research_refund_executions','provider_refund_reference','text',false,false),
        ('public.research_refund_executions','amount_cents','bigint',true,false),
        ('public.research_refund_executions','state','text',true,false)
      ) required(relation_name,column_name,type_name,not_null,has_default)
     where not exists (
       select 1
         from pg_catalog.pg_attribute a
         left join pg_catalog.pg_attrdef d
           on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid=pg_catalog.to_regclass(required.relation_name)
          and a.attname=required.column_name and a.attnum > 0
          and not a.attisdropped
          and a.atttypid=pg_catalog.to_regtype(required.type_name)
          and a.attnotnull is not distinct from required.not_null
          and (d.oid is not null) is not distinct from required.has_default
          and a.attidentity='' and a.attgenerated=''
     )
  ) then return null; end if;

  for v_signature,v_expected in select * from (values
    ('public.research_checkout_prepare(jsonb,jsonb,jsonb,timestamp with time zone,timestamp with time zone)', 'e73ad576f4afd64b13b596f384f776ab'),
    ('public.research_inventory_product_variant_ready(uuid,uuid,text)', '385873ce1a22533975b7b4d29fd209c4'),
    ('public.research_lot_quality_tests_ready(uuid)', '79b78427b7316cf37a8cff1c494b983c'),
    ('public.research_lot_quality_ready(uuid,timestamp with time zone)', '583b94379e3c9c191ea77053a7bf1715'),
    ('public.research_lot_is_allocatable(uuid,timestamp with time zone)', 'fa89053884c5c556c3f05230fe339cec'),
    ('public.research_reserve_inventory(uuid,uuid,jsonb,timestamp with time zone,timestamp with time zone,text)', '3b77a2e57552b8923e240f264921e3bb'),
    ('public.research_release_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)', '7c2850385fdf3e4b34eef933d39df74d'),
    ('public.research_finalize_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)', '25a3f19b8bbea60e8c124a798a5b1011'),
    ('public.research_expire_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)', 'ed7181efc55d6d1cf15d9ef3ef1fb8f1'),
    ('public.research_inventory_readiness_serialization_guard()', '992f13b47a18d22d3bbf434116a349da'),
    ('public.research_inventory_lot_identity_serialization_guard()', '619f0587b6558c933113c2cec74c37ca'),
    ('public.research_checkout_execution_claim(uuid,integer,text)', 'cf1ea11145096dc3a26e7b3462d3d0fd'),
    ('public.research_checkout_execution_record_provider(uuid,integer,jsonb)', '1180967b2e15fbe04362548d35f540bc'),
    ('public.research_checkout_execution_commit_captured(uuid,integer,timestamp with time zone)', '1cfd499fbd140bb925753779e03a0ab8'),
    ('public.research_checkout_execution_commit_cancelled(uuid,integer,timestamp with time zone)', 'c3739e1e013c799668450d74c06c088e'),
    ('public.research_checkout_executions_list_recoverable(timestamp with time zone,integer,timestamp with time zone,uuid)', 'ce6179514d81c0553e68be2f9e3935d6'),
    ('public.research_checkout_recovery_operation(text,uuid,bigint,jsonb)', '9af6492463c1fddbeea4fec6ed844d09'),
    ('public.research_checkout_credit_reserve()', '9d4835dc085c2fb108abb73c717e078c'),
    ('public.research_checkout_credit_lock_before_insert()', '87820a4af4817789606bb1870b818539'),
    ('public.research_store_credit_protect_reservations()', '1634f82aa22b3f60a68b74508fae82c7'),
    ('public.research_checkout_credit_immutable()', 'bf820db0a634299ede4355adcfa9d2ee'),
    ('public.research_store_credit_member_lock(uuid)', 'db84ba6c159e11d175a6fb0c0be539ab'),
    ('public.research_store_credit_balance(uuid,timestamp with time zone)', 'd87a5fc80e5f8b188037286b9def0d7f'),
    ('public.research_store_credit_require_nonexpiring(uuid)', '7348f667a1211d79154fa0b1ed1cbc46'),
    ('public.research_store_credit_spend(uuid,bigint,uuid,timestamp with time zone)', 'fe83d11ad7dc6809ab9a79dc34cf9af5'),
    ('public.research_ledger_is_append_only()', 'd0e1f7476c89df22464b67be7a1a3984'),
    ('public.research_inventory_reservation_event_immutable()', '1f1a2adf7d32b32f1ab79c7f05a89b49'),
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
  -- context without changing prosrc. Match every relevant exact signature to
  -- an exact positive owner, language, volatility, SECURITY DEFINER posture
  -- and complete SET configuration. Sorting proconfig avoids depending on DDL
  -- clause order while still rejecting any missing or extra setting.
  if exists (
    select 1
      from (values
        ('public.research_checkout_prepare(jsonb,jsonb,jsonb,timestamp with time zone,timestamp with time zone)','plpgsql','v',true,array['search_path=""']::text[]),
        ('public.research_inventory_product_variant_ready(uuid,uuid,text)','sql','s',true,array['search_path=pg_catalog']::text[]),
        ('public.research_lot_quality_tests_ready(uuid)','sql','s',true,array['search_path=pg_catalog']::text[]),
        ('public.research_lot_quality_ready(uuid,timestamp with time zone)','sql','s',true,array['search_path=pg_catalog']::text[]),
        ('public.research_lot_is_allocatable(uuid,timestamp with time zone)','sql','s',true,array['search_path=pg_catalog']::text[]),
        ('public.research_reserve_inventory(uuid,uuid,jsonb,timestamp with time zone,timestamp with time zone,text)','plpgsql','v',true,array['search_path=pg_catalog']::text[]),
        ('public.research_release_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)','plpgsql','v',true,array['search_path=pg_catalog']::text[]),
        ('public.research_finalize_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)','plpgsql','v',true,array['search_path=pg_catalog']::text[]),
        ('public.research_expire_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)','plpgsql','v',true,array['search_path=pg_catalog']::text[]),
        ('public.research_inventory_reservation_event_immutable()','plpgsql','v',true,array['search_path=pg_catalog']::text[]),
        ('public.research_inventory_readiness_serialization_guard()','plpgsql','v',true,array['search_path=pg_catalog']::text[]),
        ('public.research_inventory_lot_identity_serialization_guard()','plpgsql','v',true,array['search_path=pg_catalog']::text[]),
        ('public.research_checkout_execution_claim(uuid,integer,text)','plpgsql','v',true,array['search_path=""']::text[]),
        ('public.research_checkout_execution_record_provider(uuid,integer,jsonb)','plpgsql','v',true,array['search_path=""']::text[]),
        ('public.research_checkout_execution_commit_captured(uuid,integer,timestamp with time zone)','plpgsql','v',true,array['search_path=""']::text[]),
        ('public.research_checkout_execution_commit_cancelled(uuid,integer,timestamp with time zone)','plpgsql','v',true,array['search_path=""']::text[]),
        ('public.research_checkout_executions_list_recoverable(timestamp with time zone,integer,timestamp with time zone,uuid)','plpgsql','s',false,array[]::text[]),
        ('public.research_checkout_recovery_operation(text,uuid,bigint,jsonb)','plpgsql','v',false,array['DateStyle=ISO, YMD','TimeZone=UTC','search_path=""']::text[]),
        ('public.research_store_credit_member_lock(uuid)','plpgsql','v',false,array['search_path=""']::text[]),
        ('public.research_store_credit_balance(uuid,timestamp with time zone)','plpgsql','v',false,array['search_path=""']::text[]),
        ('public.research_store_credit_require_nonexpiring(uuid)','plpgsql','v',false,array['search_path=""']::text[]),
        ('public.research_store_credit_spend(uuid,bigint,uuid,timestamp with time zone)','plpgsql','v',false,array['search_path=""']::text[]),
        ('public.research_checkout_credit_reserve()','plpgsql','v',false,array['search_path=""']::text[]),
        ('public.research_checkout_credit_lock_before_insert()','plpgsql','v',false,array['search_path=""']::text[]),
        ('public.research_store_credit_protect_reservations()','plpgsql','v',false,array['search_path=""']::text[]),
        ('public.research_checkout_credit_immutable()','plpgsql','v',false,array['search_path=""']::text[]),
        ('public.research_ledger_is_append_only()','plpgsql','v',false,array[]::text[]),
        ('public.research_checkout_executions_immutable()','plpgsql','v',false,array[]::text[]),
        ('public.research_payment_webhook_inbox_immutable()','plpgsql','v',false,array['search_path=""']::text[]),
        ('public.research_payment_webhook_inbox_claim(text,text,text,text,timestamp with time zone)','plpgsql','v',true,array['search_path=""']::text[]),
        ('public.research_payment_webhook_inbox_terminalize(text,text,text,text,text,text,uuid,uuid)','plpgsql','v',true,array['search_path=""']::text[]),
        ('public.research_refund_execution_immutable()','plpgsql','v',false,array['search_path=pg_catalog, public']::text[]),
        ('public.research_refund_active_claim_guard()','plpgsql','v',false,array['search_path=pg_catalog, public']::text[]),
        ('public.research_refund_active_order_guard()','plpgsql','v',false,array['search_path=pg_catalog, public']::text[]),
        ('public.research_refund_execution_prepare(uuid,text,uuid,uuid,text,text,bigint,text,timestamp with time zone)','plpgsql','v',true,array['search_path=pg_catalog, public']::text[]),
        ('public.research_refund_execution_claim(uuid,integer,timestamp with time zone)','plpgsql','v',true,array['search_path=pg_catalog, public']::text[]),
        ('public.research_refund_execution_record_provider(uuid,integer,text,text,bigint,text)','plpgsql','v',true,array['search_path=pg_catalog, public']::text[]),
        ('public.research_refund_execution_require_reconciliation(uuid,integer)','plpgsql','v',true,array['search_path=pg_catalog, public']::text[]),
        ('public.research_refund_execution_commit(uuid,integer)','plpgsql','v',true,array['search_path=pg_catalog, public']::text[]),
        ('public.research_checkout_money_capability()','plpgsql','s',true,array['search_path=""']::text[])
      ) expected(signature,language_name,volatility,security_definer,settings)
      left join pg_catalog.pg_proc p
        on p.oid=pg_catalog.to_regprocedure(expected.signature)
      left join pg_catalog.pg_language l on l.oid=p.prolang
      left join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      left join pg_catalog.pg_roles owner_role on owner_role.oid=p.proowner
     where p.oid is null or n.nspname <> 'public'
        or owner_role.rolname <> 'postgres'
        or l.lanname <> expected.language_name
        or p.prokind <> 'f' or p.provolatile::text <> expected.volatility
        or p.prosecdef is distinct from expected.security_definer
        or p.proisstrict or p.proleakproof or p.proparallel <> 'u'
        or coalesce((select pg_catalog.array_agg(setting order by setting collate "C")
                       from pg_catalog.unnest(p.proconfig) setting),array[]::text[])
           is distinct from expected.settings
  ) then return null; end if;

  -- information_schema provides stable timing/event/orientation names. Pair it
  -- with pg_trigger for the exact function OID and enabled/internal flags,
  -- avoiding opaque numeric tgtype constants that can hide event drift.
  if exists (
    select 1
      from (values
        ('public.research_checkout_executions','research_checkout_executions_immutable','public.research_checkout_executions_immutable()','BEFORE',array['UPDATE']::text[],array[]::text[]),
        ('public.research_checkout_executions','research_checkout_credit_reserve','public.research_checkout_credit_reserve()','AFTER',array['INSERT']::text[],array[]::text[]),
        ('public.research_checkout_executions','research_checkout_credit_lock_before_insert','public.research_checkout_credit_lock_before_insert()','BEFORE',array['INSERT']::text[],array[]::text[]),
        ('public.research_inventory_reservation_events','research_inventory_reservation_events_no_update','public.research_inventory_reservation_event_immutable()','BEFORE',array['DELETE','UPDATE']::text[],array[]::text[]),
        ('public.research_inventory_lots','research_inventory_lot_identity_serialization','public.research_inventory_lot_identity_serialization_guard()','BEFORE',array['INSERT','UPDATE']::text[],array['product_id','sku','variant_id']::text[]),
        ('public.research_lot_quality_documents','research_reservation_quality_document_readiness_lock','public.research_inventory_readiness_serialization_guard()','BEFORE',array['DELETE','INSERT','UPDATE']::text[],array[]::text[]),
        ('public.research_lot_quality_documents','research_reservation_quality_document_readiness_validate','public.research_inventory_readiness_serialization_guard()','AFTER',array['DELETE','INSERT','UPDATE']::text[],array[]::text[]),
        ('public.research_lot_quality_tests','research_reservation_quality_test_readiness_lock','public.research_inventory_readiness_serialization_guard()','BEFORE',array['DELETE','INSERT','UPDATE']::text[],array[]::text[]),
        ('public.research_lot_quality_tests','research_reservation_quality_test_readiness_validate','public.research_inventory_readiness_serialization_guard()','AFTER',array['DELETE','INSERT','UPDATE']::text[],array[]::text[]),
        ('public.research_products','research_reservation_product_readiness_lock','public.research_inventory_readiness_serialization_guard()','BEFORE',array['DELETE','UPDATE']::text[],array[]::text[]),
        ('public.research_products','research_reservation_product_readiness_validate','public.research_inventory_readiness_serialization_guard()','AFTER',array['DELETE','UPDATE']::text[],array[]::text[]),
        ('public.research_product_variants','research_reservation_variant_readiness_lock','public.research_inventory_readiness_serialization_guard()','BEFORE',array['DELETE','UPDATE']::text[],array[]::text[]),
        ('public.research_product_variants','research_reservation_variant_readiness_validate','public.research_inventory_readiness_serialization_guard()','AFTER',array['DELETE','UPDATE']::text[],array[]::text[]),
        ('public.research_payment_webhook_inbox','research_payment_webhook_inbox_immutable','public.research_payment_webhook_inbox_immutable()','BEFORE',array['UPDATE']::text[],array[]::text[]),
        ('public.research_checkout_credit_reservations','research_checkout_credit_immutable','public.research_checkout_credit_immutable()','BEFORE',array['DELETE','UPDATE']::text[],array[]::text[]),
        ('public.research_store_credit_ledger','research_store_credit_protect_reservations','public.research_store_credit_protect_reservations()','BEFORE',array['INSERT']::text[],array[]::text[]),
        ('public.research_store_credit_ledger','research_store_credit_ledger_no_update','public.research_ledger_is_append_only()','BEFORE',array['DELETE','UPDATE']::text[],array[]::text[]),
        ('public.research_order_state_events','research_order_state_events_no_update','public.research_ledger_is_append_only()','BEFORE',array['DELETE','UPDATE']::text[],array[]::text[]),
        ('public.research_claims','research_refund_active_claim_guard','public.research_refund_active_claim_guard()','BEFORE',array['DELETE','UPDATE']::text[],array[]::text[]),
        ('public.research_orders','research_refund_active_order_guard','public.research_refund_active_order_guard()','BEFORE',array['DELETE','UPDATE']::text[],array[]::text[]),
        ('public.research_refund_executions','research_refund_execution_immutable','public.research_refund_execution_immutable()','BEFORE',array['UPDATE']::text[],array[]::text[])
      ) required(relation_name,trigger_name,function_name,action_timing,events,update_columns)
     where not exists (
       select 1
         from pg_catalog.pg_trigger t
         join pg_catalog.pg_class c on c.oid=t.tgrelid
        where t.tgrelid=pg_catalog.to_regclass(required.relation_name)
          and t.tgname=required.trigger_name
          and t.tgfoid=pg_catalog.to_regprocedure(required.function_name)
          and not t.tgisinternal and t.tgenabled='O'
          and not exists (
            select 1 from information_schema.triggers it
             where it.trigger_schema='public' and it.trigger_name=t.tgname
               and it.event_object_schema='public' and it.event_object_table=c.relname
               and (it.action_timing <> required.action_timing or it.action_orientation <> 'ROW')
          )
          and coalesce((
            select pg_catalog.array_agg(it.event_manipulation::text order by it.event_manipulation::text collate "C")
              from information_schema.triggers it
             where it.trigger_schema='public' and it.trigger_name=t.tgname
               and it.event_object_schema='public' and it.event_object_table=c.relname
          ),array[]::text[]) is not distinct from required.events
          and coalesce((
            select pg_catalog.array_agg(tuc.event_object_column::text order by tuc.event_object_column::text collate "C")
              from information_schema.triggered_update_columns tuc
             where tuc.trigger_schema='public' and tuc.trigger_name=t.tgname
               and tuc.event_object_schema='public' and tuc.event_object_table=c.relname
          ),array[]::text[]) is not distinct from required.update_columns
     )
  ) then return null; end if;

  -- Primary, unique and foreign-key identity is compared structurally through
  -- ordered column names. This avoids version-sensitive pg_get_constraintdef
  -- text while pinning targets, actions, validation and deferrability.
  if exists (
    select 1
      from (values
        ('public.research_checkout_executions','research_checkout_executions_pkey','p',array['id']::text[],null::text,array[]::text[],null::text),
        ('public.research_checkout_executions','research_checkout_executions_authorization_key_key','u',array['authorization_key']::text[],null,array[]::text[],null),
        ('public.research_checkout_executions','research_checkout_executions_capture_key_key','u',array['capture_key']::text[],null,array[]::text[],null),
        ('public.research_checkout_executions','research_checkout_executions_cancel_key_key','u',array['cancel_key']::text[],null,array[]::text[],null),
        ('public.research_checkout_executions','research_checkout_executions_member_id_request_key_key','u',array['member_id','request_key']::text[],null,array[]::text[],null),
        ('public.research_checkout_executions','research_checkout_executions_order_id_fkey','f',array['order_id']::text[],'public.research_orders',array['id']::text[],'a'),
        ('public.research_payment_webhook_inbox','research_payment_webhook_inbox_pkey','p',array['provider_name','event_id']::text[],null,array[]::text[],null),
        ('public.research_payment_webhook_inbox','research_payment_webhook_inbox_execution_id_fkey','f',array['execution_id']::text[],'public.research_checkout_executions',array['id']::text[],'a'),
        ('public.research_payment_webhook_inbox','research_payment_webhook_inbox_refund_execution_fk','f',array['refund_execution_id']::text[],'public.research_refund_executions',array['id']::text[],'a'),
        ('public.research_checkout_credit_reservations','research_checkout_credit_reservations_pkey','p',array['execution_id']::text[],null,array[]::text[],null),
        ('public.research_checkout_credit_reservations','research_checkout_credit_reservations_order_id_key','u',array['order_id']::text[],null,array[]::text[],null),
        ('public.research_checkout_credit_reservations','research_checkout_credit_reservations_debit_id_key','u',array['debit_id']::text[],null,array[]::text[],null),
        ('public.research_checkout_credit_reservations','research_checkout_credit_reservations_execution_id_fkey','f',array['execution_id']::text[],'public.research_checkout_executions',array['id']::text[],'a'),
        ('public.research_checkout_credit_reservations','research_checkout_credit_reservations_order_id_fkey','f',array['order_id']::text[],'public.research_orders',array['id']::text[],'a'),
        ('public.research_checkout_credit_reservations','research_checkout_credit_reservations_debit_id_fkey','f',array['debit_id']::text[],'public.research_store_credit_ledger',array['id']::text[],'a'),
        ('public.research_lot_reservations','research_lot_reservations_pkey','p',array['id']::text[],null,array[]::text[],null),
        ('public.research_lot_reservations','research_lot_reservations_reservation_id_key','u',array['reservation_id']::text[],null,array[]::text[],null),
        ('public.research_lot_reservation_allocations','research_lot_reservation_allocations_pkey','p',array['id']::text[],null,array[]::text[],null),
        ('public.research_lot_reservation_allocations','research_lot_reservation_allocations_unique_seq','u',array['reservation_id','seq']::text[],null,array[]::text[],null),
        ('public.research_lot_reservation_allocations','research_lot_reservation_allocations_reservation_id_fkey','f',array['reservation_id']::text[],'public.research_lot_reservations',array['id']::text[],'c'),
        ('public.research_lot_reservation_allocations','research_lot_reservation_allocations_lot_id_fkey','f',array['lot_id']::text[],'public.research_inventory_lots',array['lot_id']::text[],'a'),
        ('public.research_lot_reservation_allocations','research_lot_reservation_allocations_lot_uuid_fkey','f',array['lot_uuid']::text[],'public.research_inventory_lots',array['id']::text[],'a'),
        ('public.research_lot_reservation_allocations','research_lot_reservation_allocations_movement_id_fkey','f',array['movement_id']::text[],'public.research_inventory_movements',array['id']::text[],'a'),
        ('public.research_inventory_reservation_events','research_inventory_reservation_events_pkey','p',array['id']::text[],null,array[]::text[],null),
        ('public.research_inventory_reservation_events','research_inventory_reservation_events_idempotency_key_hash_key','u',array['idempotency_key_hash']::text[],null,array[]::text[],null),
        ('public.research_refund_executions','research_refund_executions_pkey','p',array['id']::text[],null,array[]::text[],null),
        ('public.research_refund_executions','research_refund_executions_scope_key','u',array['scope']::text[],null,array[]::text[],null),
        ('public.research_refund_executions','research_refund_executions_provider_refund_reference_key','u',array['provider_refund_reference']::text[],null,array[]::text[],null),
        ('public.research_refund_executions','research_refund_executions_order_id_fkey','f',array['order_id']::text[],'public.research_orders',array['id']::text[],'a'),
        ('public.research_refund_executions','research_refund_executions_claim_id_fkey','f',array['claim_id']::text[],'public.research_claims',array['id']::text[],'a')
      ) required(relation_name,constraint_name,constraint_type,key_columns,referenced_relation,referenced_columns,delete_action)
     where not exists (
       select 1
         from pg_catalog.pg_constraint c
        where c.conrelid=pg_catalog.to_regclass(required.relation_name)
          and c.conname=required.constraint_name
          and c.contype::text=required.constraint_type and c.convalidated
          and not c.condeferrable and not c.condeferred
          and (select pg_catalog.array_agg(a.attname::text order by key_column.ordinality)
                 from pg_catalog.unnest(c.conkey) with ordinality key_column(attnum,ordinality)
                 join pg_catalog.pg_attribute a
                   on a.attrelid=c.conrelid and a.attnum=key_column.attnum)
              is not distinct from required.key_columns
          and (c.contype <> 'f' or (
            c.confrelid=pg_catalog.to_regclass(required.referenced_relation)
            and (select pg_catalog.array_agg(a.attname::text order by referenced_column.ordinality)
                   from pg_catalog.unnest(c.confkey) with ordinality referenced_column(attnum,ordinality)
                   join pg_catalog.pg_attribute a
                     on a.attrelid=c.confrelid and a.attnum=referenced_column.attnum)
                is not distinct from required.referenced_columns
            and c.confupdtype='a' and c.confdeltype::text=required.delete_action
            and c.confmatchtype='s'
          ))
          and (c.contype='f' or exists (
            select 1 from pg_catalog.pg_index i where i.indexrelid=c.conindid
              and i.indisunique and i.indisvalid and i.indisready and i.indislive
          ))
     )
  ) then return null; end if;

  if exists (
    select 1
      from (values
        ('public.research_checkout_executions','research_checkout_executions_paid_needs_reference',
          'CHECK ((phase <> ALL (ARRAY[''authorized''::text, ''capturing''::text, ''captured''::text, ''committed''::text])) OR provider_reference IS NOT NULL)'::text),
        ('public.research_payment_webhook_inbox','research_payment_webhook_inbox_one_binding',null::text),
        ('public.research_payment_webhook_inbox','research_payment_webhook_inbox_lifecycle',null::text),
        ('public.research_checkout_credit_reservations','research_checkout_credit_reservations_settlement',null::text),
        ('public.research_lot_reservations','research_lot_reservations_released_has_date',null::text),
        ('public.research_lot_reservations','research_lot_reservations_finalized_has_date',null::text),
        ('public.research_lot_reservations','research_lot_reservations_status_check',null::text),
        ('public.research_lot_reservations','research_lot_reservations_terminal_dates',null::text),
        ('public.research_lot_reservation_allocations','research_lot_reservation_allocations_version_positive',null::text),
        ('public.research_refund_executions','research_refund_execution_attempt_state',null::text),
        ('public.research_refund_executions','research_refund_execution_provider_evidence',null::text),
        ('public.research_refund_executions','research_refund_execution_commit_stamp',null::text),
        ('public.research_refund_executions','research_refund_execution_time_order',null::text)
      ) required(relation_name,constraint_name,definition)
     where not exists (
       select 1 from pg_catalog.pg_constraint c
        where c.conrelid=pg_catalog.to_regclass(required.relation_name)
          and c.conname=required.constraint_name and c.contype='c' and c.convalidated
          and (required.definition is null
               or pg_catalog.pg_get_constraintdef(c.oid,true)=required.definition)
     )
  ) then return null; end if;

  if exists (
    select 1
      from (values
        ('public.research_checkout_executions_provider_reference_idx','public.research_checkout_executions','btree',true,array['provider_reference']::text[],'provider_reference IS NOT NULL'::text),
        ('public.research_checkout_executions_order_idx','public.research_checkout_executions','btree',false,array['order_id']::text[],null::text),
        ('public.research_checkout_executions_recoverable_idx','public.research_checkout_executions','btree',false,array['updated_at','id']::text[],'phase <> ''committed''::text AND (phase <> ''cancelled''::text OR settled_at IS NULL)'::text),
        ('public.research_store_credit_ledger_spend_order_idx','public.research_store_credit_ledger','btree',true,array['spend_order_id']::text[],'spend_order_id IS NOT NULL'::text),
        ('public.research_checkout_credit_reservations_member_held_idx','public.research_checkout_credit_reservations','btree',false,array['member_id']::text[],'state = ''held''::text'::text),
        ('public.research_refund_executions_one_active_claim','public.research_refund_executions','btree',true,array['claim_id']::text[],'state <> ''committed''::text'::text),
        ('public.research_refund_executions_one_active_order','public.research_refund_executions','btree',true,array['order_id']::text[],'state <> ''committed''::text'::text),
        ('public.research_lot_reservations_member_idx','public.research_lot_reservations','btree',false,array['member_id']::text[],null::text),
        ('public.research_lot_reservations_expiry_idx','public.research_lot_reservations','btree',false,array['expires_at']::text[],'status = ''held''::text'::text),
        ('public.research_lot_reservation_allocations_lot_idx','public.research_lot_reservation_allocations','btree',false,array['lot_id']::text[],null::text),
        ('public.research_inventory_reservation_events_reservation_idx','public.research_inventory_reservation_events','gin',false,array['reservation_ids']::text[],null::text)
      ) required(index_name,relation_name,access_method,is_unique,key_columns,predicate)
     where not exists (
       select 1
         from pg_catalog.pg_index i
         join pg_catalog.pg_class index_class on index_class.oid=i.indexrelid
         join pg_catalog.pg_am am on am.oid=index_class.relam
        where i.indexrelid=pg_catalog.to_regclass(required.index_name)
          and i.indrelid=pg_catalog.to_regclass(required.relation_name)
          and am.amname=required.access_method
          and i.indisunique is not distinct from required.is_unique
          and not i.indisprimary and i.indisvalid and i.indisready and i.indislive
          and i.indnkeyatts=pg_catalog.cardinality(required.key_columns)
          and i.indnatts=pg_catalog.cardinality(required.key_columns)
          and (select pg_catalog.array_agg(a.attname::text order by key_column.ordinality)
                 from pg_catalog.unnest(i.indkey::smallint[]) with ordinality key_column(attnum,ordinality)
                 join pg_catalog.pg_attribute a
                   on a.attrelid=i.indrelid and a.attnum=key_column.attnum
                where key_column.ordinality <= i.indnkeyatts)
              is not distinct from required.key_columns
          and i.indexprs is null
          and pg_catalog.pg_get_expr(i.indpred,i.indrelid,true)
              is not distinct from required.predicate
     )
  ) then return null; end if;

  foreach v_signature in array array[
    'public.research_checkout_prepare(jsonb,jsonb,jsonb,timestamp with time zone,timestamp with time zone)',
    'public.research_inventory_product_variant_ready(uuid,uuid,text)',
    'public.research_lot_quality_tests_ready(uuid)',
    'public.research_lot_quality_ready(uuid,timestamp with time zone)',
    'public.research_lot_is_allocatable(uuid,timestamp with time zone)',
    'public.research_reserve_inventory(uuid,uuid,jsonb,timestamp with time zone,timestamp with time zone,text)',
    'public.research_release_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)',
    'public.research_finalize_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)',
    'public.research_expire_inventory_reservations(uuid,uuid,text[],timestamp with time zone,text,text)',
    'public.research_checkout_execution_claim(uuid,integer,text)',
    'public.research_checkout_execution_record_provider(uuid,integer,jsonb)',
    'public.research_checkout_execution_commit_captured(uuid,integer,timestamp with time zone)',
    'public.research_checkout_execution_commit_cancelled(uuid,integer,timestamp with time zone)',
    'public.research_checkout_executions_list_recoverable(timestamp with time zone,integer,timestamp with time zone,uuid)',
    'public.research_checkout_recovery_operation(text,uuid,bigint,jsonb)',
    'public.research_store_credit_member_lock(uuid)',
    'public.research_store_credit_balance(uuid,timestamp with time zone)',
    'public.research_store_credit_require_nonexpiring(uuid)',
    'public.research_store_credit_spend(uuid,bigint,uuid,timestamp with time zone)',
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
            and a.grantee=0 and a.privilege_type='EXECUTE')
       or (select count(*) from pg_catalog.pg_proc p,
                    lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
             where p.oid=pg_catalog.to_regprocedure(v_signature)
               and a.grantee <> p.proowner) <> 1
       or not exists (select 1 from pg_catalog.pg_proc p,
                    lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
                    join pg_catalog.pg_roles grantee_role on grantee_role.oid=a.grantee
                    join pg_catalog.pg_roles grantor_role on grantor_role.oid=a.grantor
             where p.oid=pg_catalog.to_regprocedure(v_signature)
               and grantee_role.rolname='service_role'
               and grantor_role.rolname='postgres'
               and a.privilege_type='EXECUTE' and not a.is_grantable) then
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
    'public.research_inventory_reservation_event_immutable()',
    'public.research_inventory_readiness_serialization_guard()',
    'public.research_inventory_lot_identity_serialization_guard()',
    'public.research_ledger_is_append_only()',
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
            and a.grantee=0 and a.privilege_type='EXECUTE')
       or exists (select 1 from pg_catalog.pg_proc p,
                    lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
             where p.oid=pg_catalog.to_regprocedure(v_signature)
               and a.grantee <> p.proowner) then
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
     or pg_catalog.has_table_privilege('service_role','public.research_checkout_executions','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or pg_catalog.has_table_privilege('service_role','public.research_checkout_credit_reservations','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or pg_catalog.has_table_privilege('service_role','public.research_inventory_lots','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or pg_catalog.has_table_privilege('service_role','public.research_lot_reservations','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or pg_catalog.has_table_privilege('service_role','public.research_lot_reservation_allocations','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or pg_catalog.has_table_privilege('service_role','public.research_inventory_reservation_events','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or not pg_catalog.has_table_privilege('service_role','public.research_payment_webhook_inbox','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_refund_executions','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_checkout_executions','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_checkout_credit_reservations','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_store_credit_ledger','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_store_credit_ledger','INSERT')
     or not pg_catalog.has_table_privilege('service_role','public.research_orders','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_inventory_lots','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_lot_reservations','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_lot_reservation_allocations','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_inventory_reservation_events','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_order_lines','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_order_state_events','INSERT')
     or not pg_catalog.has_table_privilege('service_role','public.research_idempotency_keys','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.research_idempotency_keys','INSERT')
     or not pg_catalog.has_table_privilege('service_role','public.research_idempotency_keys','UPDATE') then
    return null;
  end if;
  -- Compare the complete non-owner relation ACL with the reviewed service-role
  -- grants, then separately verify effective privileges to catch role
  -- inheritance. Column-level grants are forbidden on this authority boundary.
  if exists (
    select 1
      from (values
        ('public.research_checkout_executions',array['SELECT']::text[]),
        ('public.research_payment_webhook_inbox',array['SELECT']::text[]),
        ('public.research_checkout_credit_reservations',array['SELECT']::text[]),
        ('public.research_refund_executions',array['SELECT']::text[]),
        ('public.research_orders',array['SELECT']::text[]),
        ('public.research_order_lines',array['SELECT']::text[]),
        ('public.research_order_state_events',array['INSERT']::text[]),
        ('public.research_claims',array[]::text[]),
        ('public.research_lot_reservations',array['SELECT']::text[]),
        ('public.research_lot_reservation_allocations',array['SELECT']::text[]),
        ('public.research_inventory_lots',array['SELECT']::text[]),
        ('public.research_inventory_reservation_events',array['SELECT']::text[]),
        ('public.research_store_credit_ledger',array['INSERT','SELECT']::text[]),
        ('public.research_refund_keys',array[]::text[]),
        ('public.research_idempotency_keys',array['INSERT','SELECT','UPDATE']::text[])
      ) expected(relation_name,service_privileges)
      join pg_catalog.pg_class c on c.oid=pg_catalog.to_regclass(expected.relation_name)
     where exists (
       select 1
         from pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
         left join pg_catalog.pg_roles grantee_role on grantee_role.oid=acl.grantee
         left join pg_catalog.pg_roles grantor_role on grantor_role.oid=acl.grantor
        where acl.grantee <> c.relowner
          and (grantee_role.rolname is distinct from 'service_role'
               or not acl.privilege_type=any(expected.service_privileges)
               or grantor_role.rolname is distinct from 'postgres'
               or acl.is_grantable)
     )
        or coalesce((
          select pg_catalog.array_agg(acl.privilege_type order by acl.privilege_type collate "C")
            from pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl
            join pg_catalog.pg_roles grantee_role on grantee_role.oid=acl.grantee
           where grantee_role.rolname='service_role'
        ),array[]::text[]) is distinct from expected.service_privileges
        or exists (
          select 1
            from (values ('anon'),('authenticated')) exposed(role_name),
                 (values ('DELETE'),('INSERT'),('REFERENCES'),('SELECT'),('TRIGGER'),('TRUNCATE'),('UPDATE')) privilege(name)
           where pg_catalog.has_table_privilege(exposed.role_name,expected.relation_name,privilege.name)
        )
        or exists (
          select 1
            from (values ('DELETE'),('INSERT'),('REFERENCES'),('SELECT'),('TRIGGER'),('TRUNCATE'),('UPDATE')) privilege(name)
           where pg_catalog.has_table_privilege('service_role',expected.relation_name,privilege.name)
                 is distinct from (privilege.name=any(expected.service_privileges))
        )
        or exists (
          select 1
            from pg_catalog.pg_attribute column_attribute,
                 lateral pg_catalog.aclexplode(column_attribute.attacl) acl
           where column_attribute.attrelid=c.oid and column_attribute.attnum > 0
             and not column_attribute.attisdropped and acl.grantee <> c.relowner
        )
  ) then return null; end if;
  return 'durable_checkout_money_v2:20260923.1';
end $$;

alter table public.research_refund_executions owner to postgres;
alter function public.research_payment_webhook_inbox_terminalize(text,text,text,text,text,text,uuid,uuid) owner to postgres;
alter function public.research_refund_execution_immutable() owner to postgres;
alter function public.research_refund_active_claim_guard() owner to postgres;
alter function public.research_refund_active_order_guard() owner to postgres;
alter function public.research_refund_execution_prepare(uuid,text,uuid,uuid,text,text,bigint,text,timestamptz) owner to postgres;
alter function public.research_refund_execution_claim(uuid,integer,timestamptz) owner to postgres;
alter function public.research_refund_execution_record_provider(uuid,integer,text,text,bigint,text) owner to postgres;
alter function public.research_refund_execution_require_reconciliation(uuid,integer) owner to postgres;
alter function public.research_refund_execution_commit(uuid,integer) owner to postgres;
alter function public.research_checkout_money_capability() owner to postgres;
alter function public.research_ledger_is_append_only() owner to postgres;

alter table public.research_refund_executions enable row level security;
alter table public.research_refund_executions force row level security;
revoke all on table public.research_refund_executions from public, anon, authenticated, service_role;
grant select on table public.research_refund_executions to service_role;

revoke all on function public.research_refund_execution_immutable() from public, anon, authenticated, service_role;
revoke all on function public.research_refund_active_claim_guard() from public, anon, authenticated, service_role;
revoke all on function public.research_refund_active_order_guard() from public, anon, authenticated, service_role;
revoke all on function public.research_ledger_is_append_only() from public, anon, authenticated, service_role;
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
