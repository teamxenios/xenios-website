-- LOCAL CANDIDATE, NOT A PRODUCTION MIGRATION. See sibling rollout notes.
-- Canonical Gen2 extension; no commission, entitlement, patient or payment writes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare v_name text; v_expected text; v_column record;
begin
  if current_user in ('anon','authenticated','service_role') or not exists(select 1 from pg_catalog.pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Referral candidate requires a reviewed BYPASSRLS owner';
  end if;
  if pg_catalog.to_regclass('auth.users') is null
    or not exists(select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='id' and data_type='uuid') then
    raise exception 'Missing canonical Auth user identity source';
  end if;
  foreach v_name in array array['research_members','research_partners','research_partner_links','research_attribution_touches','research_idempotency_keys'] loop
    if pg_catalog.to_regclass('public.' || v_name) is null then raise exception 'Missing canonical dependency: %', v_name; end if;
  end loop;
  for v_column in select * from (values
    ('research_members','id','uuid'),('research_members','auth_user_id','uuid'),
    ('research_partners','id','uuid'),('research_partners','member_id','uuid'),('research_partners','state','text'),
    ('research_partner_links','id','uuid'),('research_partner_links','partner_id','uuid'),('research_partner_links','code','text'),
    ('research_partner_links','created_at','timestamp with time zone'),('research_partner_links','revoked_at','timestamp with time zone'),
    ('research_attribution_touches','id','uuid'),('research_attribution_touches','subject_key','text'),('research_attribution_touches','partner_id','uuid'),
    ('research_idempotency_keys','id','uuid'),('research_idempotency_keys','scope','text'),
    ('research_idempotency_keys','key','text'),('research_idempotency_keys','result','jsonb')
  ) as expected(table_name,column_name,data_type) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=v_column.table_name and c.column_name=v_column.column_name and c.data_type=v_column.data_type) then
      raise exception 'Canonical dependency column drift: %.%',v_column.table_name,v_column.column_name;
    end if;
  end loop;
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.research_partners'::pg_catalog.regclass and conname='research_partners_active_is_fully_gated' and convalidated) then
    raise exception 'Canonical partner activation gate missing';
  end if;
  if not exists(select 1 from pg_catalog.pg_indexes where schemaname='public' and tablename='research_members' and indexdef like 'CREATE UNIQUE INDEX% (auth_user_id)')
    or not exists(select 1 from pg_catalog.pg_indexes where schemaname='public' and tablename='research_partners' and indexdef like 'CREATE UNIQUE INDEX% (member_id)')
    or not exists(select 1 from pg_catalog.pg_indexes where schemaname='public' and tablename='research_idempotency_keys' and indexdef like 'CREATE UNIQUE INDEX% (scope, key)') then
    raise exception 'Canonical ownership or idempotency uniqueness missing';
  end if;
  if exists(select 1 from public.research_partners p left join public.research_members m on m.id=p.member_id where m.id is null) then
    raise exception 'Canonical partner member identity is orphaned';
  end if;
  if exists(select 1 from public.research_partners p join public.research_members m on m.id=p.member_id
    left join auth.users u on u.id=m.auth_user_id where m.auth_user_id is not null and u.id is null) then
    raise exception 'Canonical partner Auth identity is orphaned';
  end if;
  if pg_catalog.to_regclass('public.research_partner_referral_events') is not null
    or pg_catalog.to_regclass('public.research_referral_binding_transfer_events') is not null
    or pg_catalog.to_regclass('public.research_referral_privacy_cleanup_work') is not null
    or pg_catalog.to_regclass('public.research_referral_privacy_cleanup_events') is not null
    or exists(select 1 from information_schema.columns where table_schema='public' and table_name='research_partner_links' and column_name='referral_version')
    or pg_catalog.to_regprocedure('public.research_referral_v1_execute(text,jsonb)') is not null
    or pg_catalog.to_regprocedure('public.research_referral_v1_identity_guard()') is not null
    or pg_catalog.to_regprocedure('public.research_referral_v1_privacy_begin(uuid,text)') is not null
    or pg_catalog.to_regprocedure('public.research_referral_v1_privacy_finalize(text)') is not null
    or pg_catalog.to_regprocedure('public.research_referral_v1_privacy_work_guard()') is not null
    or exists(select 1 from pg_catalog.pg_trigger where tgname in
      ('referral_v1_partner_identity_guard','referral_v1_member_auth_identity_guard',
       'referral_v1_partner_identity_no_truncate','referral_v1_member_auth_identity_no_truncate')) then
    raise exception 'Referral V1 already exists or drifted; do not silently adopt';
  end if;
  -- Adopt only the exact legacy binding candidate column shape. Never drop/cast old data.
  if pg_catalog.to_regclass('public.research_affiliate_customer_bindings') is not null then
    select string_agg(column_name || ':' || data_type, ',' order by ordinal_position) into v_expected
      from information_schema.columns where table_schema='public' and table_name='research_affiliate_customer_bindings';
    if v_expected <> 'customer_key:text,partner_id:text,code:text,subject_key:text,captured_at:timestamp with time zone,bound_at:timestamp with time zone,program_state:text,method:text,created_at:timestamp with time zone' then
      raise exception 'Existing binding table differs from the legacy candidate; review required';
    end if;
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name='research_affiliate_customer_bindings' and is_nullable<>'NO')
      or not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.research_affiliate_customer_bindings'::pg_catalog.regclass and contype='p'
        and conkey=array[(select attnum from pg_catalog.pg_attribute where attrelid='public.research_affiliate_customer_bindings'::pg_catalog.regclass and attname='customer_key')]) then
      raise exception 'Existing binding table lacks the canonical first-account key or nullability';
    end if;
    if exists(select 1 from public.research_affiliate_customer_bindings b
        left join public.research_partners p on p.id=case when b.partner_id ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then b.partner_id::uuid else null end
        where b.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and p.id is null)
      or exists(select 1 from public.research_affiliate_customer_bindings b
        left join public.research_members m on m.auth_user_id=case when b.customer_key ~*
          '^auth:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then substring(b.customer_key from 6)::uuid else null end
        where b.customer_key ~* '^auth:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and m.id is null) then
      raise exception 'Existing canonical-looking legacy binding identity is orphaned';
    end if;
  end if;
end $preflight$;

alter table public.research_partner_links
  add column referral_version smallint,
  add column token_hash_hex text,
  add column token_key_version smallint,
  add column destination_path text,
  add column expires_at timestamptz,
  add constraint referral_v1_link_shape check (
    (referral_version is null and token_hash_hex is null and token_key_version is null and destination_path is null and expires_at is null)
    or (referral_version is not null and referral_version=1 and token_hash_hex is not null and token_hash_hex ~ '^[a-f0-9]{64}$'
      and token_key_version is not null and token_key_version=1 and destination_path is not null and expires_at is not null
      and expires_at>created_at and expires_at<=created_at+interval '720 hours'
      and code=id::text and channel='signed_link'
      and (destination_path in ('/health','/care','/care/how-it-works','/research','/research/member/catalog')
        or destination_path ~ '^/research/member/products/[a-z0-9][a-z0-9._-]{0,191}$')));
create unique index referral_v1_token_hash_unique on public.research_partner_links(token_hash_hex) where referral_version=1;

alter table public.research_attribution_touches
  add column referral_version smallint,
  add column referral_link_id uuid references public.research_partner_links(id),
  add column referral_expires_at timestamptz,
  add constraint referral_v1_touch_shape check (
    (referral_version is null and referral_link_id is null and referral_expires_at is null)
    or (referral_version is not null and referral_version=1 and referral_link_id is not null and referral_expires_at is not null
      and subject_key ~ '^[a-f0-9]{64}$' and channel='signed_link' and set_by_admin_id is null
      and referral_expires_at>occurred_at));
create unique index referral_v1_first_subject_unique on public.research_attribution_touches(subject_key) where referral_version=1;

create table if not exists public.research_affiliate_customer_bindings (
  customer_key text primary key check(customer_key ~ '^[^[:space:]@]{3,200}$'),
  partner_id text not null check(partner_id ~ '^[^[:space:]@]{1,200}$'),
  code text not null check(char_length(code) between 1 and 512),
  subject_key text not null check(subject_key ~ '^[^[:space:]@]{3,200}$'),
  captured_at timestamptz not null,
  bound_at timestamptz not null,
  program_state text not null check(program_state in ('active','pending_program')),
  method text not null check(method='attribution_cookie'),
  created_at timestamptz not null default now(),
  check(captured_at<=bound_at)
);
alter table public.research_affiliate_customer_bindings
  add column referral_version smallint,
  add column referral_link_id uuid references public.research_partner_links(id),
  add column referral_touch_id uuid references public.research_attribution_touches(id),
  add constraint referral_v1_binding_shape check (
    (referral_version is null and referral_link_id is null and referral_touch_id is null)
    or (referral_version is not null and referral_version=1 and referral_link_id is not null and referral_touch_id is not null
      and customer_key ~ '^auth:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      and subject_key ~ '^[a-f0-9]{64}$' and code=referral_link_id::text
      and program_state='pending_program'));
-- A browser capture can bind once, even if its signed cookie is copied to another account.
create unique index referral_v1_touch_binding_unique on public.research_affiliate_customer_bindings(referral_touch_id) where referral_version=1;

-- The first capture binding never changes. An authorized future-only transfer
-- is a new immutable event whose effective time is assigned by the database.
-- No email, name, address, health fact, rate or money field belongs here.
create table public.research_referral_binding_transfer_events (
  id uuid primary key default gen_random_uuid(),
  account_key text not null references public.research_affiliate_customer_bindings(customer_key),
  previous_revision_id uuid not null,
  previous_partner_id uuid not null references public.research_partners(id),
  previous_link_id uuid not null references public.research_partner_links(id),
  next_partner_id uuid not null references public.research_partners(id),
  next_link_id uuid not null references public.research_partner_links(id),
  actor_auth_user_id uuid not null,
  reason_code text not null check(reason_code in ('customer_request','documented_correction','compliance_action')),
  authorization_reference_hash text not null check(authorization_reference_hash ~ '^[a-f0-9]{64}$'),
  effective_at timestamptz not null default clock_timestamp(),
  check(account_key ~ '^auth:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
  check(previous_partner_id<>next_partner_id and previous_link_id<>next_link_id)
);
create index referral_v1_transfers_account_time on public.research_referral_binding_transfer_events(account_key,effective_at desc,id desc);
create index referral_v1_transfers_partner_time on public.research_referral_binding_transfer_events(next_partner_id,effective_at desc,id desc);
create unique index referral_v1_transfer_previous_unique on public.research_referral_binding_transfer_events(account_key,previous_revision_id);

create table public.research_partner_referral_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check(event_type in ('link_issued','link_revoked','capture_recorded','account_bound')),
  partner_id uuid not null references public.research_partners(id),
  link_id uuid not null references public.research_partner_links(id),
  touch_id uuid references public.research_attribution_touches(id),
  actor_auth_user_id uuid,
  occurred_at timestamptz not null default clock_timestamp(),
  check((event_type in ('link_issued','link_revoked') and touch_id is null and actor_auth_user_id is not null)
    or (event_type='capture_recorded' and touch_id is not null)
    or (event_type='account_bound' and touch_id is not null and actor_auth_user_id is not null))
);
create index referral_v1_events_partner_time on public.research_partner_referral_events(partner_id,occurred_at desc);

-- Manual verified-deletion support for the Referral V1 slice only. The work
-- row is visible only inside the deleting transaction and binds every evidence
-- guard bypass to exact row IDs derived from one locked canonical member. The
-- durable cleanup event is not the full privacy-policy completion tombstone.
-- Identity authorization never survives the transaction: a deferred guard
-- rejects commit unless the exact partner/member cleanup is finalized.
create table public.research_referral_privacy_cleanup_work (
  transaction_id xid8 primary key,
  member_id uuid not null,
  auth_user_id uuid,
  partner_id uuid,
  authorization_reference_hash text not null
    check(authorization_reference_hash ~ '^[a-f0-9]{64}$'),
  account_keys text[] not null,
  link_ids uuid[] not null,
  touch_ids uuid[] not null,
  binding_keys text[] not null,
  legacy_binding_keys text[] not null,
  transfer_ids uuid[] not null,
  event_ids uuid[] not null,
  idempotency_ids uuid[] not null,
  deleted_row_count integer not null check(deleted_row_count>=0)
);

create table public.research_referral_privacy_cleanup_events (
  id uuid primary key default gen_random_uuid(),
  authorization_reference_hash text not null unique
    check(authorization_reference_hash ~ '^[a-f0-9]{64}$'),
  deleted_row_count integer not null check(deleted_row_count>=0),
  executed_at timestamptz not null default clock_timestamp()
);

create function public.research_referral_v1_privacy_begin(
  p_member_id uuid,
  p_authorization_reference_hash text
) returns jsonb
language plpgsql security definer set search_path='' as $privacy_delete$
declare
  v_member record; v_partner_id uuid; v_account_key text;
  v_account_keys text[]:='{}'; v_link_ids uuid[]:='{}'; v_touch_ids uuid[]:='{}';
  v_binding_keys text[]:='{}'; v_legacy_binding_keys text[]:='{}';
  v_transfer_ids uuid[]:='{}'; v_event_ids uuid[]:='{}';
  v_idempotency_ids uuid[]:='{}'; v_deleted integer; v_total integer:=0;
begin
  if p_member_id is null or coalesce(p_authorization_reference_hash,'') !~ '^[a-f0-9]{64}$'
    or session_user in ('anon','authenticated','service_role')
    or not exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user and (r.rolsuper or r.rolbypassrls)) then
    raise exception 'Referral privacy deletion requires a reviewed owner and authorization reference' using errcode='42501';
  end if;
  -- Same mutation fence as execute(); no issuance/capture/bind/transfer can
  -- repopulate this subject between cleanup and same-transaction deletion.
  perform pg_catalog.pg_advisory_xact_lock(9042026,1);
  -- Legacy binding DML does not take the V1 advisory lock. Fence the whole
  -- binding relation before identity row locks so an in-flight legacy writer is
  -- observed, while a later writer waits and revalidates canonical identities.
  lock table public.research_affiliate_customer_bindings in share row exclusive mode;
  select m.id,m.auth_user_id into v_member from public.research_members m where m.id=p_member_id for update;
  if not found then raise exception 'Referral privacy deletion member not found' using errcode='P0002'; end if;
  select p.id into v_partner_id from public.research_partners p where p.member_id=p_member_id for update;
  if v_member.auth_user_id is not null then v_account_key:='auth:'||v_member.auth_user_id::text; end if;

  select coalesce(pg_catalog.array_agg(q.id order by q.id),'{}'::uuid[]) into v_link_ids from (
    select distinct l.id from public.research_partner_links l
      where l.partner_id=v_partner_id and l.referral_version=1
  ) q;
  -- K is directional: the deleting account, base bindings to the deleting
  -- partner, and accounts whose transfer lineage directly involved that
  -- partner or one of that partner's links. Never expand through an unrelated
  -- account to that account's external links.
  select coalesce(pg_catalog.array_agg(q.customer_key order by q.customer_key),'{}'::text[]) into v_account_keys from (
    select v_account_key as customer_key where v_account_key is not null
    union
    select b.customer_key from public.research_affiliate_customer_bindings b
      where b.referral_version=1 and (b.partner_id=v_partner_id::text or b.referral_link_id=any(v_link_ids))
    union
    select x.account_key from public.research_referral_binding_transfer_events x
      where x.previous_partner_id=v_partner_id or x.next_partner_id=v_partner_id
        or x.previous_link_id=any(v_link_ids) or x.next_link_id=any(v_link_ids)
  ) q;
  -- An admin actor UUID on an otherwise unrelated customer's immutable
  -- transfer/idempotency lineage needs a counsel-approved redaction rule. Fail
  -- this exceptional request closed; never erase that customer's attribution.
  if v_member.auth_user_id is not null and (
      exists(select 1 from public.research_referral_binding_transfer_events x
        where x.actor_auth_user_id=v_member.auth_user_id and not (x.account_key=any(v_account_keys)))
      or exists(select 1 from public.research_idempotency_keys i
        where i.scope like 'referral-v1:transferBinding:%'
          and i.result->'fingerprint'->>'actorAuthUserId'=v_member.auth_user_id::text
          and not exists(select 1 from pg_catalog.unnest(v_account_keys) k
            where i.scope='referral-v1:transferBinding:'||k))) then
    raise exception 'Referral privacy cleanup requires reviewed admin-actor redaction guidance' using errcode='55000';
  end if;
  -- T contains the deleting partner's own touches plus only the exact touch
  -- claimed by the deleting member-as-customer. An external partner's shared
  -- link and its unrelated visitors are outside this deletion set.
  select coalesce(pg_catalog.array_agg(q.id order by q.id),'{}'::uuid[]) into v_touch_ids from (
    select distinct t.id from public.research_attribution_touches t
      where t.referral_version=1 and (t.partner_id=v_partner_id or t.referral_link_id=any(v_link_ids))
    union
    select b.referral_touch_id from public.research_affiliate_customer_bindings b
      where b.referral_version=1 and v_account_key is not null
        and b.customer_key=v_account_key and b.referral_touch_id is not null
  ) q;
  select coalesce(pg_catalog.array_agg(q.customer_key order by q.customer_key),'{}'::text[]) into v_binding_keys from (
    select distinct b.customer_key from public.research_affiliate_customer_bindings b
      where b.referral_version=1 and b.customer_key=any(v_account_keys)
  ) q;
  -- The predecessor binding table is protected by the same immutable trigger.
  -- Give verified deletion a separate, exact compatibility set: only a legacy
  -- row whose account is this member or whose base partner is this partner.
  select coalesce(pg_catalog.array_agg(q.customer_key order by q.customer_key),'{}'::text[]) into v_legacy_binding_keys from (
    select distinct b.customer_key from public.research_affiliate_customer_bindings b
      where b.referral_version is null and (
        (v_member.auth_user_id is not null
          and b.customer_key ~* '^auth:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and substring(b.customer_key from 6)::uuid=v_member.auth_user_id)
        or (v_partner_id is not null
          and b.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and b.partner_id::uuid=v_partner_id))
  ) q;
  select coalesce(pg_catalog.array_agg(q.id order by q.id),'{}'::uuid[]) into v_transfer_ids from (
    select distinct x.id from public.research_referral_binding_transfer_events x
      where x.account_key=any(v_binding_keys)
  ) q;
  select coalesce(pg_catalog.array_agg(q.id order by q.id),'{}'::uuid[]) into v_event_ids from (
    select distinct e.id from public.research_partner_referral_events e
      where e.partner_id=v_partner_id or e.link_id=any(v_link_ids) or e.touch_id=any(v_touch_ids)
        or (v_member.auth_user_id is not null and e.actor_auth_user_id=v_member.auth_user_id)
  ) q;
  select coalesce(pg_catalog.array_agg(q.id order by q.id),'{}'::uuid[]) into v_idempotency_ids from (
    select distinct i.id from public.research_idempotency_keys i where
      (v_member.auth_user_id is not null and i.scope in (
        'referral-v1:issue:'||v_member.auth_user_id::text,'referral-v1:revoke:'||v_member.auth_user_id::text))
      or exists(select 1 from pg_catalog.unnest(v_binding_keys) k
        where i.scope='referral-v1:transferBinding:'||k)
  ) q;

  insert into public.research_referral_privacy_cleanup_work(
    transaction_id,member_id,auth_user_id,partner_id,authorization_reference_hash,
    account_keys,link_ids,touch_ids,binding_keys,legacy_binding_keys,transfer_ids,event_ids,idempotency_ids,deleted_row_count)
  values(pg_catalog.pg_current_xact_id(),p_member_id,v_member.auth_user_id,v_partner_id,
    p_authorization_reference_hash,v_account_keys,v_link_ids,v_touch_ids,v_binding_keys,v_legacy_binding_keys,
    v_transfer_ids,v_event_ids,v_idempotency_ids,0);

  delete from public.research_referral_binding_transfer_events where id=any(v_transfer_ids);
  get diagnostics v_deleted=row_count; v_total:=v_total+v_deleted;
  delete from public.research_partner_referral_events where id=any(v_event_ids);
  get diagnostics v_deleted=row_count; v_total:=v_total+v_deleted;
  delete from public.research_affiliate_customer_bindings where customer_key=any(v_binding_keys);
  get diagnostics v_deleted=row_count; v_total:=v_total+v_deleted;
  delete from public.research_affiliate_customer_bindings where customer_key=any(v_legacy_binding_keys);
  get diagnostics v_deleted=row_count; v_total:=v_total+v_deleted;
  delete from public.research_attribution_touches where id=any(v_touch_ids);
  get diagnostics v_deleted=row_count; v_total:=v_total+v_deleted;
  delete from public.research_partner_links where id=any(v_link_ids);
  get diagnostics v_deleted=row_count; v_total:=v_total+v_deleted;
  delete from public.research_idempotency_keys where id=any(v_idempotency_ids);
  get diagnostics v_deleted=row_count; v_total:=v_total+v_deleted;
  update public.research_referral_privacy_cleanup_work set deleted_row_count=v_total
    where transaction_id=pg_catalog.pg_current_xact_id();
  return pg_catalog.jsonb_build_object('deletedRowCount',v_total,'referralCleanupPrepared',true,
    'mustFinalizeInCurrentTransaction',true);
end $privacy_delete$;

create function public.research_referral_v1_privacy_finalize(
  p_authorization_reference_hash text
) returns jsonb
language plpgsql security definer set search_path='' as $privacy_finalize$
declare v_work public.research_referral_privacy_cleanup_work; v_event_id uuid;
begin
  if coalesce(p_authorization_reference_hash,'') !~ '^[a-f0-9]{64}$'
    or session_user in ('anon','authenticated','service_role')
    or not exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user and (r.rolsuper or r.rolbypassrls)) then
    raise exception 'Referral privacy finalization requires a reviewed owner and authorization reference' using errcode='42501';
  end if;
  select * into v_work from public.research_referral_privacy_cleanup_work w
    where w.transaction_id=pg_catalog.pg_current_xact_id()
      and w.authorization_reference_hash=p_authorization_reference_hash for update;
  if not found then raise exception 'Referral privacy cleanup was not prepared in this transaction' using errcode='55000'; end if;
  if exists(select 1 from public.research_partners p where p.id=v_work.partner_id)
    or exists(select 1 from public.research_members m where m.id=v_work.member_id) then
    raise exception 'Referral privacy identities must be deleted before finalization' using errcode='55000';
  end if;
  delete from public.research_referral_privacy_cleanup_work w where w.transaction_id=v_work.transaction_id;
  insert into public.research_referral_privacy_cleanup_events(authorization_reference_hash,deleted_row_count)
    values(p_authorization_reference_hash,v_work.deleted_row_count) returning id into v_event_id;
  return pg_catalog.jsonb_build_object('cleanupEventId',v_event_id,
    'deletedRowCount',v_work.deleted_row_count,'referralIdentityCleanupCompleted',true);
end $privacy_finalize$;

-- Fires at constraint-check/commit time for the row inserted by privacy_begin.
-- A caller that fails to delete the exact identities and finalize cannot leave
-- either partially deleted evidence or a persistent PII-bearing work row.
create function public.research_referral_v1_privacy_work_guard() returns trigger
language plpgsql security definer set search_path='' as $privacy_work_guard$
begin
  if exists(select 1 from public.research_referral_privacy_cleanup_work w
      where w.transaction_id=new.transaction_id) then
    raise exception 'Referral privacy cleanup must be finalized in its preparing transaction' using errcode='55000';
  end if;
  return null;
end $privacy_work_guard$;

-- Non-definer trigger: direct service_role calls retain their real role. Existing
-- legacy rows/operations are unaffected; V1 rows can only be written by the RPC owner.
create function public.research_referral_v1_guard() returns trigger
language plpgsql set search_path='' as $guard$
declare v_owner name; v_old jsonb; v_new jsonb; v_protected boolean; v_privacy_delete boolean:=false;
begin
  if tg_op='TRUNCATE' then raise exception 'Referral evidence cannot be truncated' using errcode='55000'; end if;
  select pg_catalog.pg_get_userbyid(p.proowner) into v_owner from pg_catalog.pg_proc p
    where p.oid='public.research_referral_v1_execute(text,jsonb)'::pg_catalog.regprocedure;
  if tg_op<>'INSERT' then v_old:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then v_new:=to_jsonb(new); end if;
  v_protected:=tg_table_name in ('research_partner_referral_events','research_affiliate_customer_bindings','research_referral_binding_transfer_events','research_referral_privacy_cleanup_events')
    or coalesce(v_old->>'referral_version','')='1' or coalesce(v_new->>'referral_version','')='1'
    or coalesce(v_old->>'scope','') like 'referral-v1:%' or coalesce(v_new->>'scope','') like 'referral-v1:%';
  if tg_table_name='research_affiliate_customer_bindings' and tg_op in ('INSERT','UPDATE')
      and coalesce(v_new->>'referral_version','')<>'1' then
    if coalesce(v_new->>'partner_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      perform 1 from public.research_partners p where p.id=(v_new->>'partner_id')::uuid for key share;
      if not found then raise exception 'Legacy referral canonical partner identity is invalid' using errcode='23503'; end if;
    end if;
    if coalesce(v_new->>'customer_key','') ~* '^auth:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      perform 1 from public.research_members m where m.auth_user_id=substring(v_new->>'customer_key' from 6)::uuid for key share;
      if not found then raise exception 'Legacy referral canonical member identity is invalid' using errcode='23503'; end if;
    end if;
  end if;
  if not v_protected then if tg_op='DELETE' then return old; else return new; end if; end if;
  if current_user<>v_owner then raise exception 'Referral V1 requires its authority RPC' using errcode='42501'; end if;
  if tg_op='DELETE' and tg_table_name<>'research_referral_privacy_cleanup_events' then
    select case tg_table_name
      when 'research_partner_links' then (v_old->>'id')::uuid=any(w.link_ids)
      when 'research_attribution_touches' then (v_old->>'id')::uuid=any(w.touch_ids)
      when 'research_affiliate_customer_bindings' then v_old->>'customer_key'=any(w.binding_keys)
        or v_old->>'customer_key'=any(w.legacy_binding_keys)
      when 'research_referral_binding_transfer_events' then (v_old->>'id')::uuid=any(w.transfer_ids)
      when 'research_partner_referral_events' then (v_old->>'id')::uuid=any(w.event_ids)
      when 'research_idempotency_keys' then (v_old->>'id')::uuid=any(w.idempotency_ids)
      else false end into v_privacy_delete
    from public.research_referral_privacy_cleanup_work w
    where w.transaction_id=pg_catalog.pg_current_xact_id();
    if coalesce(v_privacy_delete,false) then return old; end if;
  end if;
  if tg_op='INSERT' then return new; end if;
  if tg_table_name='research_partner_links' and tg_op='UPDATE' then
    if (v_old-'revoked_at')=(v_new-'revoked_at') and old.revoked_at is null and new.revoked_at is not null then return new; end if;
  end if;
  raise exception 'Referral evidence is immutable' using errcode='55000';
end $guard$;

-- A successful self-referral check is durable only if the identity edges used
-- by that check cannot later be rewritten. Partner lifecycle operations update
-- state and review facts, never member ownership. A partner-linked member may
-- acquire its first Auth UUID (account claim), but an established Auth identity
-- and a partner's owning member are immutable after this authority is installed.
-- Deletion is the narrow exception: a reviewed owner needs the current
-- transaction's exact cleanup work row and live proof that no referral row
-- still references the subject. The deferred work guard makes an unfinished
-- or unfinalized exception roll back at commit.
create function public.research_referral_v1_identity_guard() returns trigger
language plpgsql security definer set search_path='' as $identity_guard$
declare
  v_old jsonb; v_new jsonb; v_member_auth uuid;
  v_reviewed_owner boolean:=false; v_cleanup_authorized boolean:=false; v_has_referral_rows boolean:=false;
begin
  if tg_op='TRUNCATE' then
    raise exception 'Referral identity cannot be truncated' using errcode='55000';
  end if;
  if tg_op<>'INSERT' then v_old:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then v_new:=to_jsonb(new); end if;
  select exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user
      and r.rolname not in ('anon','authenticated','service_role') and (r.rolsuper or r.rolbypassrls))
    into v_reviewed_owner;
  if tg_table_name='research_partners' and tg_op='INSERT' then
    select m.auth_user_id into v_member_auth from public.research_members m
      where m.id=(v_new->>'member_id')::uuid for update;
    if not found then
      raise exception 'Referral partner member identity is invalid' using errcode='23503';
    end if;
    if v_member_auth is not null then
      perform 1 from auth.users u where u.id=v_member_auth for key share;
      if not found then
        raise exception 'Referral partner Auth identity is invalid' using errcode='23503';
      end if;
    end if;
    return new;
  end if;
  if tg_table_name='research_partners' and tg_op='DELETE' then
    select exists(select 1 from public.research_referral_privacy_cleanup_work w
      where w.transaction_id=pg_catalog.pg_current_xact_id()
        and w.partner_id=(v_old->>'id')::uuid) into v_cleanup_authorized;
    select exists(select 1 from public.research_partner_links l where l.partner_id=(v_old->>'id')::uuid)
      or exists(select 1 from public.research_attribution_touches t where t.partner_id=(v_old->>'id')::uuid)
      or exists(select 1 from public.research_affiliate_customer_bindings b
        where b.partner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and b.partner_id::uuid=(v_old->>'id')::uuid)
      or exists(select 1 from public.research_referral_binding_transfer_events x
        where x.previous_partner_id=(v_old->>'id')::uuid or x.next_partner_id=(v_old->>'id')::uuid)
      or exists(select 1 from public.research_partner_referral_events e where e.partner_id=(v_old->>'id')::uuid)
      into v_has_referral_rows;
    if not v_reviewed_owner or not v_cleanup_authorized or v_has_referral_rows then
      raise exception 'Referral partner identity is immutable; privacy cleanup is required before deletion' using errcode='55000';
    end if;
    return old;
  end if;
  if tg_table_name='research_partners' and (
    v_new->>'id' is distinct from v_old->>'id'
    or v_new->>'member_id' is distinct from v_old->>'member_id') then
    raise exception 'Referral partner identity is immutable' using errcode='55000';
  end if;
  if tg_table_name='research_members' and tg_op='DELETE' then
    select exists(select 1 from public.research_referral_privacy_cleanup_work w
      where w.transaction_id=pg_catalog.pg_current_xact_id()
        and w.member_id=(v_old->>'id')::uuid
        and w.auth_user_id is not distinct from (v_old->>'auth_user_id')::uuid)
      into v_cleanup_authorized;
    select exists(select 1 from public.research_partners p where p.member_id=(v_old->>'id')::uuid)
      or (v_old->>'auth_user_id' is not null and (
        exists(select 1 from public.research_affiliate_customer_bindings b
          where b.customer_key ~* '^auth:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and substring(b.customer_key from 6)::uuid=(v_old->>'auth_user_id')::uuid)
        or exists(select 1 from public.research_referral_binding_transfer_events x
          where x.account_key='auth:'||(v_old->>'auth_user_id')
            or x.actor_auth_user_id=(v_old->>'auth_user_id')::uuid)
        or exists(select 1 from public.research_partner_referral_events e
          where e.actor_auth_user_id=(v_old->>'auth_user_id')::uuid)
        or exists(select 1 from public.research_idempotency_keys i where
          i.scope in ('referral-v1:issue:'||(v_old->>'auth_user_id'),
            'referral-v1:revoke:'||(v_old->>'auth_user_id'),
            'referral-v1:transferBinding:auth:'||(v_old->>'auth_user_id'))
          or (i.scope like 'referral-v1:transferBinding:%'
            and i.result->'fingerprint'->>'actorAuthUserId'=v_old->>'auth_user_id'))))
      into v_has_referral_rows;
    if v_has_referral_rows or (v_cleanup_authorized and not v_reviewed_owner) then
      raise exception 'Referral partner Auth identity is immutable; privacy cleanup is required before member deletion' using errcode='55000';
    end if;
    -- Members with no referral relationship retain the canonical table's
    -- pre-existing deletion path. Once privacy_begin prepared this member,
    -- only the reviewed owner may consume that exact transaction-local work.
    return old;
  end if;
  if tg_table_name='research_members'
    and exists(select 1 from public.research_partners where member_id=(v_old->>'id')::uuid) then
    if v_new->>'id' is distinct from v_old->>'id'
      or (v_new->>'auth_user_id' is distinct from v_old->>'auth_user_id' and v_old->>'auth_user_id' is not null) then
      raise exception 'Referral partner Auth identity is immutable' using errcode='55000';
    end if;
    if v_new->>'auth_user_id' is distinct from v_old->>'auth_user_id' then
      perform 1 from auth.users u where u.id=(v_new->>'auth_user_id')::uuid for key share;
      if not found then
        raise exception 'Referral partner Auth identity is invalid' using errcode='23503';
      end if;
    end if;
  end if;
  return new;
end $identity_guard$;

-- Durable claimed bindings depend on canonical partner eligibility, not the
-- later lifecycle of the link that was valid when the claim was made.
create function public.research_referral_v1_partner_availability(p_partner_id uuid,p_actor uuid default null) returns text
language plpgsql security definer set search_path='' as $partner_availability$
declare p public.research_partners;
begin
  select * into p from public.research_partners where id=p_partner_id for share;
  if not found or p.state is distinct from 'active' or p.identity_verified is distinct from true
    or p.tax_status is distinct from 'verified' or p.payout_status is distinct from 'verified'
    or p.certified_at is null or p.activated_at is null then return 'partner_inactive'; end if;
  if p_actor is not null and exists(select 1 from public.research_members where id=p.member_id and auth_user_id=p_actor) then return 'self_referral'; end if;
  return 'ready';
end $partner_availability$;

create function public.research_referral_v1_availability(p_link_id uuid,p_actor uuid default null) returns text
language plpgsql security definer set search_path='' as $availability$
declare l public.research_partner_links; p public.research_partners;
begin
  -- Lock partner before link; external lifecycle changes cannot race the decision.
  select p0.* into p from public.research_partners p0 join public.research_partner_links l0 on l0.partner_id=p0.id
    where l0.id=p_link_id and l0.referral_version=1 for share of p0;
  if not found then return 'partner_inactive'; end if;
  select * into l from public.research_partner_links where id=p_link_id and referral_version=1 for share;
  if l.revoked_at is not null then return 'revoked'; end if;
  if l.expires_at<=clock_timestamp() then return 'expired'; end if;
  return public.research_referral_v1_partner_availability(p.id,p_actor);
end $availability$;

create function public.research_referral_v1_link_json(p_id uuid) returns jsonb
language sql security definer set search_path='' as $link$
  select jsonb_build_object('id',l.id,'partnerId',l.partner_id,'internalCode',l.code,
    'tokenKeyVersion',l.token_key_version,'tokenHashHex',l.token_hash_hex,'destinationPath',l.destination_path,'createdAt',l.created_at,
    'expiresAt',l.expires_at,'revokedAt',l.revoked_at,'availability',public.research_referral_v1_availability(l.id),
    'captureCount',(select count(*) from public.research_attribution_touches t where t.referral_link_id=l.id and t.referral_version=1),
    'bindingCount',(select count(*) from public.research_affiliate_customer_bindings b
      left join lateral (select x.next_link_id from public.research_referral_binding_transfer_events x
        where x.account_key=b.customer_key order by x.effective_at desc,x.id desc limit 1) current on true
      where coalesce(current.next_link_id,b.referral_link_id)=l.id and b.referral_version=1))
  from public.research_partner_links l where l.id=p_id and l.referral_version=1;
$link$;

create function public.research_referral_v1_binding_json(p_key text) returns jsonb
language sql security definer set search_path='' as $binding$
  select jsonb_build_object('accountKey',customer_key,'linkId',referral_link_id,'touchId',referral_touch_id,
    'partnerId',partner_id,'boundAt',bound_at)
  from public.research_affiliate_customer_bindings where customer_key=p_key and referral_version=1;
$binding$;

create function public.research_referral_v1_effective_binding_json(p_key text) returns jsonb
language plpgsql security definer set search_path='' as $effective_binding$
declare
  b public.research_affiliate_customer_bindings;
  x public.research_referral_binding_transfer_events;
begin
  select * into b from public.research_affiliate_customer_bindings where customer_key=p_key and referral_version=1;
  if not found then return null; end if;
  select * into x from public.research_referral_binding_transfer_events where account_key=p_key order by effective_at desc,id desc limit 1;
  if found then
    return jsonb_build_object('accountKey',b.customer_key,'linkId',x.next_link_id,'touchId',b.referral_touch_id,
      'partnerId',x.next_partner_id,'boundAt',b.bound_at,'revisionId',x.id,'effectiveAt',x.effective_at,'source','admin_transfer');
  end if;
  return jsonb_build_object('accountKey',b.customer_key,'linkId',b.referral_link_id,'touchId',b.referral_touch_id,
    'partnerId',b.partner_id,'boundAt',b.bound_at,'revisionId',b.referral_touch_id,'effectiveAt',b.bound_at,'source','capture');
end $effective_binding$;

-- Point-in-time projection. A later transfer cannot rewrite attribution for an
-- event that occurred before that transfer became effective.
create function public.research_referral_v1_binding_at_json(p_key text,p_occurred_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $binding_at$
declare
  b public.research_affiliate_customer_bindings;
  x public.research_referral_binding_transfer_events;
begin
  select * into b from public.research_affiliate_customer_bindings
    where customer_key=p_key and referral_version=1;
  if not found or p_occurred_at<b.bound_at then return null; end if;
  select * into x from public.research_referral_binding_transfer_events
    where account_key=p_key and effective_at<=p_occurred_at
    order by effective_at desc,id desc limit 1;
  if found then
    return jsonb_build_object('accountKey',b.customer_key,'linkId',x.next_link_id,'touchId',b.referral_touch_id,
      'partnerId',x.next_partner_id,'boundAt',b.bound_at,'revisionId',x.id,'effectiveAt',x.effective_at,'source','admin_transfer');
  end if;
  return jsonb_build_object('accountKey',b.customer_key,'linkId',b.referral_link_id,'touchId',b.referral_touch_id,
    'partnerId',b.partner_id,'boundAt',b.bound_at,'revisionId',b.referral_touch_id,'effectiveAt',b.bound_at,'source','capture');
end $binding_at$;

create function public.research_referral_v1_transfer_json(p_id uuid) returns jsonb
language sql security definer set search_path='' as $transfer$
  select jsonb_build_object('id',x.id,'accountKey',x.account_key,'previousRevisionId',x.previous_revision_id,
    'previousPartnerId',x.previous_partner_id,'previousLinkId',x.previous_link_id,'nextPartnerId',x.next_partner_id,
    'nextLinkId',x.next_link_id,'reasonCode',x.reason_code,'authorizationReferenceHash',x.authorization_reference_hash,
    'effectiveAt',x.effective_at)
  from public.research_referral_binding_transfer_events x where x.id=p_id;
$transfer$;

create function public.research_referral_v1_transfer_binding_json(p_id uuid) returns jsonb
language sql security definer set search_path='' as $transfer_binding$
  select jsonb_build_object('accountKey',b.customer_key,'linkId',x.next_link_id,'touchId',b.referral_touch_id,
    'partnerId',x.next_partner_id,'boundAt',b.bound_at,'revisionId',x.id,'effectiveAt',x.effective_at,'source','admin_transfer')
  from public.research_referral_binding_transfer_events x
  join public.research_affiliate_customer_bindings b on b.customer_key=x.account_key and b.referral_version=1
  where x.id=p_id;
$transfer_binding$;

create function public.research_referral_v1_binding_availability(p_key text,p_actor uuid) returns text
language plpgsql security definer set search_path='' as $binding_availability$
declare v_binding jsonb;
begin
  v_binding:=public.research_referral_v1_effective_binding_json(p_key);
  if v_binding is null then return 'partner_inactive'; end if;
  return public.research_referral_v1_partner_availability((v_binding->>'partnerId')::uuid,p_actor);
end $binding_availability$;

create function public.research_referral_v1_execute(p_operation text,p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $execute$
declare
  a uuid; p public.research_partners; l public.research_partner_links; t public.research_attribution_touches;
  b public.research_affiliate_customer_bindings; v_now timestamptz; v_id uuid; v_subject text;
  v_key text; v_scope text; v_fingerprint jsonb; v_replay jsonb; v_created boolean:=false;
  v_availability text; v_result jsonb; v_links jsonb; v_events jsonb; v_touches jsonb; v_bindings jsonb; v_transfers jsonb; v_limit int;
  v_account_actor uuid; v_target_link public.research_partner_links; v_transfer public.research_referral_binding_transfer_events;
  v_occurred_at timestamptz;
begin
  if jsonb_typeof(p_input)<>'object' or p_operation not in ('issue','revoke','listOwn','resolve','capture','bind','getBinding','bindingAt','transferBinding','listAdmin') then
    return jsonb_build_object('ok',false,'reason','invalid_input');
  end if;
  if p_operation in ('issue','revoke','listOwn','bind','getBinding','bindingAt','transferBinding','listAdmin') or p_input ? 'actorAuthUserId' then
    if coalesce(p_input->>'actorAuthUserId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
      return jsonb_build_object('ok',false,'reason','invalid_input'); end if;
    a:=(p_input->>'actorAuthUserId')::uuid;
  end if;
  -- Deliberately bounded V1 serialization. Row locks also fence external lifecycle
  -- writes. This favors correctness over throughput; do not claim load certification.
  if p_operation in ('issue','revoke','capture','bind','transferBinding') then perform pg_advisory_xact_lock(9042026,1); end if;
  v_now:=clock_timestamp();

  if p_operation='listOwn' then
    select p0.* into p from public.research_partners p0 join public.research_members m on m.id=p0.member_id
      where m.auth_user_id=a and m.status<>'closed' for share of p0,m;
    select coalesce(jsonb_agg(public.research_referral_v1_link_json(q.id) order by q.created_at desc,q.id),'[]'::jsonb) into v_links
      from (select id,created_at from public.research_partner_links where partner_id=p.id and referral_version=1 order by created_at desc,id limit 100) q;
    return jsonb_build_object('ok',true,'value',jsonb_build_object('eligible',coalesce(p.state='active' and p.identity_verified=true and p.tax_status='verified' and p.payout_status='verified' and p.certified_at is not null and p.activated_at is not null,false),
      'partnerId',p.id,'partnerState',p.state,'links',v_links));
  end if;

  if p_operation in ('issue','revoke') then
    v_key:=p_input->>'idempotencyKey';
    if v_key is null or v_key !~ '^[A-Za-z0-9_-]{16,128}$' then return jsonb_build_object('ok',false,'reason','invalid_input'); end if;
    v_scope:='referral-v1:'||p_operation||':'||a::text;
    if p_operation='issue' then
      if (p_input-'actorAuthUserId'-'idempotencyKey'-'linkId'-'tokenHashHex'-'tokenKeyVersion'-'destinationPath'-'expiresInDays')<>'{}'::jsonb
        or p_input->>'expiresInDays' is distinct from '30' or p_input->>'tokenKeyVersion' is distinct from '1'
        or coalesce(p_input->>'tokenHashHex','') !~ '^[a-f0-9]{64}$'
        or coalesce(p_input->>'linkId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
        or not (coalesce(p_input->>'destinationPath','') in ('/health','/care','/care/how-it-works','/research','/research/member/catalog')
          or coalesce(p_input->>'destinationPath','') ~ '^/research/member/products/[a-z0-9][a-z0-9._-]{0,191}$') then
        return jsonb_build_object('ok',false,'reason','invalid_input'); end if;
      v_fingerprint:=jsonb_build_object('destinationPath',p_input->>'destinationPath','expiresInDays',30);
    else
      if (p_input-'actorAuthUserId'-'idempotencyKey'-'linkId')<>'{}'::jsonb
        or coalesce(p_input->>'linkId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
        return jsonb_build_object('ok',false,'reason','invalid_input'); end if;
      v_fingerprint:=jsonb_build_object('linkId',p_input->>'linkId');
    end if;
    select result into v_replay from public.research_idempotency_keys where scope=v_scope and key=v_key;
    if found then
      if v_replay->'fingerprint' is distinct from v_fingerprint or v_replay->>'linkId' is null then
        return jsonb_build_object('ok',false,'reason','idempotency_conflict'); end if;
      v_result:=public.research_referral_v1_link_json((v_replay->>'linkId')::uuid);
      if v_result is null then raise exception 'Missing durable idempotency result'; end if;
      return jsonb_build_object('ok',true,'value',jsonb_build_object('link',v_result,'created',false));
    end if;
    -- Mutable account/partner eligibility applies only to a new mutation. A
    -- matching durable replay remains observable after closure or suspension.
    select p0.* into p from public.research_partners p0 join public.research_members m on m.id=p0.member_id
      where m.auth_user_id=a and m.status<>'closed' for share of p0,m;
    if p.id is null then return jsonb_build_object('ok',false,'reason','not_eligible'); end if;
    v_id:=(p_input->>'linkId')::uuid;
    if p_operation='issue' then
      if p.state is distinct from 'active' or p.identity_verified is distinct from true or p.tax_status is distinct from 'verified'
        or p.payout_status is distinct from 'verified' or p.certified_at is null or p.activated_at is null then return jsonb_build_object('ok',false,'reason','not_eligible'); end if;
      insert into public.research_partner_links(id,partner_id,code,channel,created_at,referral_version,token_hash_hex,token_key_version,destination_path,expires_at)
        values(v_id,p.id,v_id::text,'signed_link',v_now,1,p_input->>'tokenHashHex',1,p_input->>'destinationPath',v_now+interval '720 hours');
      insert into public.research_partner_referral_events(event_type,partner_id,link_id,actor_auth_user_id) values('link_issued',p.id,v_id,a);
      v_created:=true;
    else
      select * into l from public.research_partner_links where id=v_id and partner_id=p.id and referral_version=1 for update;
      if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
      if l.revoked_at is null then
        update public.research_partner_links set revoked_at=v_now where id=v_id;
        insert into public.research_partner_referral_events(event_type,partner_id,link_id,actor_auth_user_id) values('link_revoked',p.id,v_id,a);
        v_created:=true;
      end if;
    end if;
    insert into public.research_idempotency_keys(scope,key,result,settled_at) values(v_scope,v_key,jsonb_build_object('fingerprint',v_fingerprint,'linkId',v_id),v_now);
    return jsonb_build_object('ok',true,'value',jsonb_build_object('link',public.research_referral_v1_link_json(v_id),'created',v_created));
  end if;

  if p_operation in ('resolve','capture') then
    if coalesce(p_input->>'tokenHashHex','') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'reason','invalid_input'); end if;
    select * into l from public.research_partner_links where token_hash_hex=p_input->>'tokenHashHex' and referral_version=1;
    if not found then return jsonb_build_object('ok',false,'reason','invalid_link'); end if;
    v_availability:=public.research_referral_v1_availability(l.id,a);
    if v_availability='self_referral' then return jsonb_build_object('ok',false,'reason','self_referral'); end if;
    if v_availability<>'ready' then return jsonb_build_object('ok',false,'reason','invalid_link'); end if;
    if p_operation='resolve' then return jsonb_build_object('ok',true,'value',jsonb_build_object('link',public.research_referral_v1_link_json(l.id))); end if;
    v_subject:=p_input->>'subjectKeyHash';
    if v_subject is null or v_subject !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'reason','invalid_input'); end if;
    select * into t from public.research_attribution_touches where subject_key=v_subject and referral_version=1;
    if not found then
      insert into public.research_attribution_touches(subject_key,partner_id,channel,occurred_at,referral_version,referral_link_id,referral_expires_at)
        values(v_subject,l.partner_id,'signed_link',v_now,1,l.id,l.expires_at) returning * into t;
      insert into public.research_partner_referral_events(event_type,partner_id,link_id,touch_id,actor_auth_user_id) values('capture_recorded',t.partner_id,t.referral_link_id,t.id,a);
      v_created:=true;
    end if;
    v_availability:=public.research_referral_v1_availability(t.referral_link_id,a);
    if t.referral_expires_at<=clock_timestamp() and v_availability='ready' then v_availability:='expired'; end if;
    return jsonb_build_object('ok',true,'value',jsonb_build_object('touch',jsonb_build_object('touchId',t.id,'linkId',t.referral_link_id,'partnerId',t.partner_id,
      'subjectKeyHash',t.subject_key,'capturedAt',t.occurred_at,'expiresAt',t.referral_expires_at),'created',v_created,'availability',v_availability,
      'conflictPreserved',not v_created and t.referral_link_id<>l.id));
  end if;

  -- A canonical admin-authenticated server route is the only caller. This RPC
  -- records the asserted admin UUID as provenance, while the target partner is
  -- derived exclusively from a canonical V1 link. No caller may set an
  -- effective time, partner UUID, customer key, rate, hold or ownership fact.
  if p_operation='transferBinding' then
    if (p_input - 'actorAuthUserId' - 'accountAuthUserId' - 'expectedRevisionId' - 'targetLinkId'
        - 'idempotencyKey' - 'reasonCode' - 'authorizationReferenceHash')<>'{}'::jsonb
      or coalesce(p_input->>'accountAuthUserId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or coalesce(p_input->>'expectedRevisionId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or coalesce(p_input->>'targetLinkId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{16,128}$'
      or coalesce(p_input->>'reasonCode','') not in ('customer_request','documented_correction','compliance_action')
      or coalesce(p_input->>'authorizationReferenceHash','') !~ '^[a-f0-9]{64}$' then
      return jsonb_build_object('ok',false,'reason','invalid_input');
    end if;
    v_account_actor:=(p_input->>'accountAuthUserId')::uuid;
    v_key:='auth:'||v_account_actor::text;
    v_fingerprint:=jsonb_build_object(
      'actorAuthUserId',a,'accountAuthUserId',v_account_actor,
      'expectedRevisionId',p_input->>'expectedRevisionId','targetLinkId',p_input->>'targetLinkId',
      'reasonCode',p_input->>'reasonCode','authorizationReferenceHash',p_input->>'authorizationReferenceHash');
    v_scope:='referral-v1:transferBinding:'||v_key;
    select result into v_replay from public.research_idempotency_keys
      where scope=v_scope and key=p_input->>'idempotencyKey';
    if found then
      if v_replay->'fingerprint' is distinct from v_fingerprint or v_replay->>'transferId' is null then
        return jsonb_build_object('ok',false,'reason','idempotency_conflict');
      end if;
      v_id:=(v_replay->>'transferId')::uuid;
      v_result:=public.research_referral_v1_transfer_binding_json(v_id);
      if v_result is null or public.research_referral_v1_transfer_json(v_id) is null then
        raise exception 'Missing durable transfer idempotency result';
      end if;
      return jsonb_build_object('ok',true,'value',jsonb_build_object(
        'binding',v_result,'transfer',public.research_referral_v1_transfer_json(v_id),'created',false));
    end if;

    -- Resolve a matching durable replay before mutable account eligibility.
    -- New transfers still require an open canonical account and V1 binding.
    perform 1 from public.research_members where auth_user_id=v_account_actor and status<>'closed' for share;
    if not found then return jsonb_build_object('ok',false,'reason','not_eligible'); end if;
    select * into b from public.research_affiliate_customer_bindings where customer_key=v_key for share;
    if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
    if b.referral_version is distinct from 1 then return jsonb_build_object('ok',false,'reason','capture_claimed'); end if;

    v_result:=public.research_referral_v1_effective_binding_json(v_key);
    if v_result->>'revisionId' is distinct from p_input->>'expectedRevisionId' then
      return jsonb_build_object('ok',false,'reason','stale_binding');
    end if;
    select * into v_target_link from public.research_partner_links
      where id=(p_input->>'targetLinkId')::uuid and referral_version=1;
    if not found then return jsonb_build_object('ok',false,'reason','invalid_link'); end if;
    v_availability:=public.research_referral_v1_availability(v_target_link.id,v_account_actor);
    if v_availability='self_referral' then return jsonb_build_object('ok',false,'reason','self_referral'); end if;
    if v_availability<>'ready' then return jsonb_build_object('ok',false,'reason','invalid_link'); end if;
    if v_result->>'partnerId'=v_target_link.partner_id::text or v_result->>'linkId'=v_target_link.id::text then
      return jsonb_build_object('ok',false,'reason','invalid_input');
    end if;

    insert into public.research_referral_binding_transfer_events(
      account_key,previous_revision_id,previous_partner_id,previous_link_id,next_partner_id,next_link_id,
      actor_auth_user_id,reason_code,authorization_reference_hash,effective_at)
    values(v_key,(v_result->>'revisionId')::uuid,(v_result->>'partnerId')::uuid,(v_result->>'linkId')::uuid,
      v_target_link.partner_id,v_target_link.id,a,p_input->>'reasonCode',p_input->>'authorizationReferenceHash',
      greatest(clock_timestamp(),(v_result->>'effectiveAt')::timestamptz+interval '1 microsecond'))
    returning * into v_transfer;
    insert into public.research_idempotency_keys(scope,key,result,settled_at)
      values(v_scope,p_input->>'idempotencyKey',jsonb_build_object('fingerprint',v_fingerprint,'transferId',v_transfer.id),v_now);
    return jsonb_build_object('ok',true,'value',jsonb_build_object(
      'binding',public.research_referral_v1_transfer_binding_json(v_transfer.id),
      'transfer',public.research_referral_v1_transfer_json(v_transfer.id),'created',true));
  end if;

  if p_operation='bindingAt' then
    if (p_input-'actorAuthUserId'-'occurredAt')<>'{}'::jsonb
      or coalesce(p_input->>'occurredAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
      return jsonb_build_object('ok',false,'reason','invalid_input');
    end if;
    v_occurred_at:=(p_input->>'occurredAt')::timestamptz;
    if pg_catalog.isfinite(v_occurred_at) is not true then return jsonb_build_object('ok',false,'reason','invalid_input'); end if;
    -- Historical server reconciliation remains possible after account closure,
    -- but a UUID that never belonged to a canonical member is not an account.
    perform 1 from public.research_members where auth_user_id=a for share;
    if not found then return jsonb_build_object('ok',false,'reason','not_eligible'); end if;
    v_key:='auth:'||a::text;
    v_result:=public.research_referral_v1_binding_at_json(v_key,v_occurred_at);
    if v_result is null then return jsonb_build_object('ok',true,'value',jsonb_build_object(
      'binding',null,'created',false,'availability','none')); end if;
    -- bindingAt is an immutable ownership projection at p_input.occurredAt.
    -- Current partner state cannot rewrite that historical fact: a later
    -- suspension must not make an exact economic-event replay disappear.
    -- Earning eligibility belongs to the schedule/partner-state authority at
    -- the same occurrence instant. Self-referral was already refused when the
    -- initial binding or future-only transfer was committed.
    return jsonb_build_object('ok',true,'value',jsonb_build_object(
      'binding',v_result,'created',false,'availability','ready'));
  end if;

  if p_operation in ('bind','getBinding') then
    perform 1 from public.research_members where auth_user_id=a and status<>'closed' for share;
    if not found then return jsonb_build_object('ok',false,'reason','not_eligible'); end if;
    v_key:='auth:'||a::text;
    if p_operation='bind' and (coalesce(p_input->>'subjectKeyHash','') !~ '^[a-f0-9]{64}$'
      or coalesce(p_input->>'touchId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then
      return jsonb_build_object('ok',false,'reason','invalid_input');
    end if;
    select * into b from public.research_affiliate_customer_bindings where customer_key=v_key;
    if found then
      -- Do not overwrite any legacy winner or represent it as verified V1 lineage.
      if b.referral_version is distinct from 1 then return jsonb_build_object('ok',false,'reason','capture_claimed'); end if;
      return jsonb_build_object('ok',true,'value',jsonb_build_object('binding',public.research_referral_v1_effective_binding_json(v_key),'created',false,
        'availability',public.research_referral_v1_binding_availability(v_key,a),
        'conflictPreserved',p_operation='bind' and b.referral_touch_id<>(p_input->>'touchId')::uuid));
    end if;
    if p_operation='getBinding' then return jsonb_build_object('ok',true,'value',jsonb_build_object('binding',null,'created',false,'availability','none')); end if;
    select * into t from public.research_attribution_touches where id=(p_input->>'touchId')::uuid and subject_key=p_input->>'subjectKeyHash' and referral_version=1;
    if not found then return jsonb_build_object('ok',false,'reason','capture_missing'); end if;
    v_availability:=public.research_referral_v1_availability(t.referral_link_id,a);
    if v_availability='self_referral' then return jsonb_build_object('ok',false,'reason','self_referral'); end if;
    if v_availability<>'ready' or t.referral_expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'reason','invalid_link'); end if;
    if exists(select 1 from public.research_affiliate_customer_bindings where referral_touch_id=t.id) then return jsonb_build_object('ok',false,'reason','capture_claimed'); end if;
    insert into public.research_affiliate_customer_bindings(customer_key,partner_id,code,subject_key,captured_at,bound_at,program_state,method,referral_version,referral_link_id,referral_touch_id)
      values(v_key,t.partner_id::text,t.referral_link_id::text,t.subject_key,t.occurred_at,v_now,'pending_program','attribution_cookie',1,t.referral_link_id,t.id);
    insert into public.research_partner_referral_events(event_type,partner_id,link_id,touch_id,actor_auth_user_id) values('account_bound',t.partner_id,t.referral_link_id,t.id,a);
    return jsonb_build_object('ok',true,'value',jsonb_build_object('binding',public.research_referral_v1_effective_binding_json(v_key),
      'created',true,'availability','ready','conflictPreserved',false));
  end if;

  -- Service-only entry point; canonical HTTP requireSupabaseAdmin runs before it.
  -- The asserted UUID is provenance, not a new database admin role authority.
  if p_operation='listAdmin' then
    v_limit:=coalesce((p_input->>'limit')::int,50);
    if v_limit<1 or v_limit>100 then return jsonb_build_object('ok',false,'reason','invalid_input'); end if;
    if p_input ? 'partnerId' then v_id:=(p_input->>'partnerId')::uuid; end if;
    select coalesce(jsonb_agg(public.research_referral_v1_link_json(q.id)),'[]'::jsonb) into v_links
      from (select id from public.research_partner_links where referral_version=1 and (v_id is null or partner_id=v_id) order by created_at desc,id limit v_limit) q;
    select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'eventType',q.event_type,'partnerId',q.partner_id,'linkId',q.link_id,'occurredAt',q.occurred_at)),'[]'::jsonb) into v_events
      from (select * from public.research_partner_referral_events where v_id is null or partner_id=v_id order by occurred_at desc,id limit v_limit) q;
    select coalesce(jsonb_agg(jsonb_build_object('touchId',q.id,'linkId',q.referral_link_id,'partnerId',q.partner_id,'capturedAt',q.occurred_at,
      'expiresAt',q.referral_expires_at,'availability',public.research_referral_v1_availability(q.referral_link_id))),'[]'::jsonb) into v_touches
      from (select * from public.research_attribution_touches where referral_version=1 and (v_id is null or partner_id=v_id) order by occurred_at desc,id limit v_limit) q;
    select coalesce(jsonb_agg(public.research_referral_v1_effective_binding_json(q.customer_key)||jsonb_build_object('availability',
      public.research_referral_v1_binding_availability(q.customer_key,substring(q.customer_key from 6)::uuid))),'[]'::jsonb) into v_bindings
      from (select binding_row.* from public.research_affiliate_customer_bindings binding_row
        left join lateral (select x.next_partner_id from public.research_referral_binding_transfer_events x
          where x.account_key=binding_row.customer_key order by x.effective_at desc,x.id desc limit 1) current on true
        where binding_row.referral_version=1 and (v_id is null or coalesce(current.next_partner_id,binding_row.partner_id::uuid)=v_id)
        order by binding_row.bound_at desc,binding_row.customer_key limit v_limit) q;
    select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'accountKey',q.account_key,'previousRevisionId',q.previous_revision_id,
      'previousPartnerId',q.previous_partner_id,'previousLinkId',q.previous_link_id,'nextPartnerId',q.next_partner_id,
      'nextLinkId',q.next_link_id,'reasonCode',q.reason_code,'effectiveAt',q.effective_at)),'[]'::jsonb) into v_transfers
      from (select * from public.research_referral_binding_transfer_events
        where v_id is null or previous_partner_id=v_id or next_partner_id=v_id order by effective_at desc,id limit v_limit) q;
    return jsonb_build_object('ok',true,'value',jsonb_build_object('links',v_links,'events',v_events,'touches',v_touches,
      'bindings',v_bindings,'transfers',v_transfers));
  end if;
  return jsonb_build_object('ok',false,'reason','invalid_input');
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('ok',false,'reason','invalid_input');
end $execute$;

create trigger referral_v1_links_guard before insert or update or delete on public.research_partner_links for each row execute function public.research_referral_v1_guard();
create trigger referral_v1_touches_guard before insert or update or delete on public.research_attribution_touches for each row execute function public.research_referral_v1_guard();
create trigger referral_v1_bindings_guard before insert or update or delete on public.research_affiliate_customer_bindings for each row execute function public.research_referral_v1_guard();
create trigger referral_v1_transfers_guard before insert or update or delete on public.research_referral_binding_transfer_events for each row execute function public.research_referral_v1_guard();
create trigger referral_v1_events_guard before insert or update or delete on public.research_partner_referral_events for each row execute function public.research_referral_v1_guard();
create trigger referral_v1_idempotency_guard before insert or update or delete on public.research_idempotency_keys for each row execute function public.research_referral_v1_guard();
create trigger referral_v1_privacy_events_guard before insert or update or delete on public.research_referral_privacy_cleanup_events for each row execute function public.research_referral_v1_guard();
create constraint trigger referral_v1_privacy_work_must_finalize
  after insert on public.research_referral_privacy_cleanup_work
  deferrable initially deferred for each row
  execute function public.research_referral_v1_privacy_work_guard();
create trigger referral_v1_partner_identity_guard before insert or update of id,member_id or delete on public.research_partners for each row execute function public.research_referral_v1_identity_guard();
create trigger referral_v1_member_auth_identity_guard before update of id,auth_user_id or delete on public.research_members for each row execute function public.research_referral_v1_identity_guard();
create trigger referral_v1_partner_identity_no_truncate before truncate on public.research_partners for each statement execute function public.research_referral_v1_identity_guard();
create trigger referral_v1_member_auth_identity_no_truncate before truncate on public.research_members for each statement execute function public.research_referral_v1_identity_guard();
create trigger referral_v1_links_no_truncate before truncate on public.research_partner_links for each statement execute function public.research_referral_v1_guard();
create trigger referral_v1_touches_no_truncate before truncate on public.research_attribution_touches for each statement execute function public.research_referral_v1_guard();
create trigger referral_v1_bindings_no_truncate before truncate on public.research_affiliate_customer_bindings for each statement execute function public.research_referral_v1_guard();
create trigger referral_v1_transfers_no_truncate before truncate on public.research_referral_binding_transfer_events for each statement execute function public.research_referral_v1_guard();
create trigger referral_v1_events_no_truncate before truncate on public.research_partner_referral_events for each statement execute function public.research_referral_v1_guard();
create trigger referral_v1_idempotency_no_truncate before truncate on public.research_idempotency_keys for each statement execute function public.research_referral_v1_guard();
create trigger referral_v1_privacy_events_no_truncate before truncate on public.research_referral_privacy_cleanup_events for each statement execute function public.research_referral_v1_guard();
create trigger referral_v1_privacy_work_no_truncate before truncate on public.research_referral_privacy_cleanup_work for each statement execute function public.research_referral_v1_guard();

alter table public.research_affiliate_customer_bindings enable row level security;
alter table public.research_affiliate_customer_bindings force row level security;
alter table public.research_partner_referral_events enable row level security;
alter table public.research_partner_referral_events force row level security;
alter table public.research_referral_binding_transfer_events enable row level security;
alter table public.research_referral_binding_transfer_events force row level security;
alter table public.research_referral_privacy_cleanup_work enable row level security;
alter table public.research_referral_privacy_cleanup_work force row level security;
alter table public.research_referral_privacy_cleanup_events enable row level security;
alter table public.research_referral_privacy_cleanup_events force row level security;
revoke all on public.research_affiliate_customer_bindings,public.research_partner_referral_events,
  public.research_referral_binding_transfer_events,public.research_referral_privacy_cleanup_work,
  public.research_referral_privacy_cleanup_events from public,anon,authenticated,service_role;
-- Preserve old canonical access, but no untrusted browser table access or truncate.
revoke all on public.research_partner_links,public.research_attribution_touches,public.research_idempotency_keys from public,anon,authenticated;
revoke truncate on public.research_partner_links,public.research_attribution_touches,public.research_idempotency_keys from service_role;
revoke truncate on public.research_partners,public.research_members from public,anon,authenticated,service_role;

create function public.research_referral_v1_authority() returns jsonb
language plpgsql security definer set search_path='' as $authority$
declare v_role text; v_table text; v_fn record; v_probe jsonb; v_execute_body text; v_guard_body text; v_identity_body text;
  v_privacy_begin_body text; v_privacy_finalize_body text; v_privacy_work_body text;
  v_schema text:='gen2_referral_v1_transfer_base_20260921';
begin
  if current_user in ('anon','authenticated','service_role') or not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then raise exception 'Referral owner capability drift'; end if;
  if (select pg_catalog.count(*) from pg_catalog.unnest(array['public.research_referral_v1_guard()','public.research_referral_v1_identity_guard()','public.research_referral_v1_partner_availability(uuid,uuid)',
    'public.research_referral_v1_availability(uuid,uuid)',
    'public.research_referral_v1_link_json(uuid)','public.research_referral_v1_binding_json(text)',
    'public.research_referral_v1_effective_binding_json(text)','public.research_referral_v1_transfer_json(uuid)',
    'public.research_referral_v1_transfer_binding_json(uuid)','public.research_referral_v1_binding_availability(text,uuid)',
    'public.research_referral_v1_binding_at_json(text,timestamp with time zone)',
    'public.research_referral_v1_privacy_begin(uuid,text)','public.research_referral_v1_privacy_finalize(text)',
    'public.research_referral_v1_privacy_work_guard()',
    'public.research_referral_v1_execute(text,jsonb)','public.research_referral_v1_authority()']) f where pg_catalog.to_regprocedure(f) is not null)<>16 then raise exception 'Referral function inventory drift'; end if;
  foreach v_table in array array['research_affiliate_customer_bindings','research_partner_referral_events','research_referral_binding_transfer_events',
      'research_referral_privacy_cleanup_work','research_referral_privacy_cleanup_events'] loop
    if not exists(select 1 from pg_catalog.pg_class where oid=pg_catalog.to_regclass('public.'||v_table) and relrowsecurity and relforcerowsecurity)
      or exists(select 1 from pg_catalog.pg_policy where polrelid=pg_catalog.to_regclass('public.'||v_table)) then raise exception 'Referral RLS drift'; end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if pg_catalog.has_table_privilege(v_role,'public.'||v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'Referral table privilege drift'; end if;
    end loop;
  end loop;
  for v_fn in select p.oid,p.proname,p.prosecdef,p.proconfig,p.proowner from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'research_referral_v1_%' loop
    if pg_catalog.has_function_privilege('anon',v_fn.oid,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_fn.oid,'EXECUTE') then raise exception 'Referral function privilege drift'; end if;
    if v_fn.proname not in ('research_referral_v1_execute','research_referral_v1_authority') and pg_catalog.has_function_privilege('service_role',v_fn.oid,'EXECUTE') then raise exception 'Referral helper privilege drift'; end if;
    if v_fn.proname in ('research_referral_v1_execute','research_referral_v1_authority') and not pg_catalog.has_function_privilege('service_role',v_fn.oid,'EXECUTE') then raise exception 'Referral entrypoint grant missing'; end if;
    if v_fn.proowner<>current_user::pg_catalog.regrole::oid or v_fn.proconfig is distinct from array['search_path=""']::text[] then raise exception 'Referral function owner or search_path drift'; end if;
    if v_fn.proname<>'research_referral_v1_guard' and not v_fn.prosecdef then raise exception 'Referral owner drift'; end if;
  end loop;
  if (select pg_catalog.count(*) from pg_catalog.pg_trigger where tgname in ('referral_v1_links_guard','referral_v1_touches_guard','referral_v1_bindings_guard','referral_v1_transfers_guard','referral_v1_events_guard','referral_v1_idempotency_guard','referral_v1_privacy_events_guard',
    'referral_v1_links_no_truncate','referral_v1_touches_no_truncate','referral_v1_bindings_no_truncate','referral_v1_transfers_no_truncate','referral_v1_events_no_truncate','referral_v1_idempotency_no_truncate','referral_v1_privacy_events_no_truncate')
    and tgenabled='O' and tgfoid='public.research_referral_v1_guard()'::pg_catalog.regprocedure)<>14 then raise exception 'Referral trigger drift'; end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_trigger t where t.tgenabled='O' and (
      (t.tgname='referral_v1_privacy_events_guard'
        and t.tgrelid='public.research_referral_privacy_cleanup_events'::pg_catalog.regclass
        and t.tgfoid='public.research_referral_v1_guard()'::pg_catalog.regprocedure and t.tgtype=31 and t.tgattr::text='')
      or (t.tgname='referral_v1_privacy_events_no_truncate'
        and t.tgrelid='public.research_referral_privacy_cleanup_events'::pg_catalog.regclass
        and t.tgfoid='public.research_referral_v1_guard()'::pg_catalog.regprocedure and t.tgtype=34 and t.tgattr::text='')
      or (t.tgname='referral_v1_privacy_work_no_truncate'
        and t.tgrelid='public.research_referral_privacy_cleanup_work'::pg_catalog.regclass
        and t.tgfoid='public.research_referral_v1_guard()'::pg_catalog.regprocedure and t.tgtype=34 and t.tgattr::text='')
      or (t.tgname='referral_v1_privacy_work_must_finalize'
        and t.tgrelid='public.research_referral_privacy_cleanup_work'::pg_catalog.regclass
        and t.tgfoid='public.research_referral_v1_privacy_work_guard()'::pg_catalog.regprocedure
        and t.tgtype=5 and t.tgattr::text='' and t.tgdeferrable and t.tginitdeferred)))<>4 then
    raise exception 'Referral privacy trigger topology drift';
  end if;
  if pg_catalog.to_regclass('auth.users') is null then
    raise exception 'Referral identity source drift';
  end if;
  if exists(select 1 from public.research_referral_privacy_cleanup_work) then
    raise exception 'Referral privacy cleanup work leaked outside its transaction';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_trigger t
    where t.tgenabled='O' and t.tgfoid='public.research_referral_v1_identity_guard()'::pg_catalog.regprocedure and (
      (t.tgname='referral_v1_partner_identity_guard' and t.tgrelid='public.research_partners'::pg_catalog.regclass and t.tgtype=31 and t.tgattr::text='1 2')
      or (t.tgname='referral_v1_member_auth_identity_guard' and t.tgrelid='public.research_members'::pg_catalog.regclass and t.tgtype=27 and t.tgattr::text='1 3')
      or (t.tgname='referral_v1_partner_identity_no_truncate' and t.tgrelid='public.research_partners'::pg_catalog.regclass and t.tgtype=34 and t.tgattr::text='')
      or (t.tgname='referral_v1_member_auth_identity_no_truncate' and t.tgrelid='public.research_members'::pg_catalog.regclass and t.tgtype=34 and t.tgattr::text='')
    ))<>4 then raise exception 'Referral identity trigger drift'; end if;
  select p.prosrc into v_identity_body from pg_catalog.pg_proc p
    where p.oid='public.research_referral_v1_identity_guard()'::pg_catalog.regprocedure;
  select p.prosrc into v_guard_body from pg_catalog.pg_proc p
    where p.oid='public.research_referral_v1_guard()'::pg_catalog.regprocedure;
  if pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.regexp_replace(v_guard_body,'[[:space:]]+',' ','g'),'UTF8')),'hex')
      <> '8af628c36ee02f86561f9f6b229f0798f374a0e095aade9d69417001bbbda71f' then
    raise exception 'Referral evidence guard body drift';
  end if;
  if pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.regexp_replace(v_identity_body,'[[:space:]]+',' ','g'),'UTF8')),'hex')
      <> '1613778b4ca6b24eed816052ee5e4a2011157688b666809c027d44a48f38e73f' then
    raise exception 'Referral identity guard body drift';
  end if;
  select p.prosrc into v_privacy_begin_body from pg_catalog.pg_proc p
    where p.oid='public.research_referral_v1_privacy_begin(uuid,text)'::pg_catalog.regprocedure;
  select p.prosrc into v_privacy_finalize_body from pg_catalog.pg_proc p
    where p.oid='public.research_referral_v1_privacy_finalize(text)'::pg_catalog.regprocedure;
  select p.prosrc into v_privacy_work_body from pg_catalog.pg_proc p
    where p.oid='public.research_referral_v1_privacy_work_guard()'::pg_catalog.regprocedure;
  if pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.regexp_replace(v_privacy_begin_body,'[[:space:]]+',' ','g'),'UTF8')),'hex')
      <> 'c2c127596af5fc1dc490b4c0f2a20d25cd074e1a55f99263a82eeeb952ded93d'
    or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.regexp_replace(v_privacy_finalize_body,'[[:space:]]+',' ','g'),'UTF8')),'hex')
      <> '2c8bc2a2ca1d4ac6ad29dbd2395d8ae6b8950d510ab5dc1564185eac7123feb6'
    or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.regexp_replace(v_privacy_work_body,'[[:space:]]+',' ','g'),'UTF8')),'hex')
      <> '2b0806441b3c5f5da8282aff1e0c9cf12336aef03b5252a82a1ecd9379882e4b' then
    raise exception 'Referral privacy cleanup function drift';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if pg_catalog.has_table_privilege(v_role,'public.research_partners','TRUNCATE')
      or pg_catalog.has_table_privilege(v_role,'public.research_members','TRUNCATE') then
      raise exception 'Referral identity table privilege drift';
    end if;
  end loop;
  if (select pg_catalog.count(*) from pg_catalog.pg_index where indexrelid in (pg_catalog.to_regclass('public.referral_v1_token_hash_unique'),pg_catalog.to_regclass('public.referral_v1_first_subject_unique'),
    pg_catalog.to_regclass('public.referral_v1_touch_binding_unique'),pg_catalog.to_regclass('public.referral_v1_transfer_previous_unique')) and indisunique and indisvalid)<>4 then raise exception 'Referral uniqueness drift'; end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_constraint where conname in ('referral_v1_link_shape','referral_v1_touch_shape','referral_v1_binding_shape') and convalidated)<>3 then raise exception 'Referral shape drift'; end if;

  -- Exact dispatcher manifest checks remain read-only. Invoking transfer would
  -- acquire row locks and make the authority unusable from the read-only
  -- production postcheck.
  v_execute_body:=pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.research_referral_v1_execute(text,jsonb)'));
  if pg_catalog.strpos(v_execute_body,'if p_operation=''transferBinding'' then')=0
    or pg_catalog.strpos(v_execute_body,'insert into public.research_referral_binding_transfer_events')=0
    or pg_catalog.strpos(v_execute_body,'public.research_referral_v1_transfer_binding_json')=0 then
    raise exception 'Referral transfer operation drift';
  end if;
  if pg_catalog.to_regprocedure('public.research_referral_v1_touch_attribution(uuid,text,uuid)') is not null then
    if pg_catalog.strpos(v_execute_body,'if p_operation=''attributionForTouch'' then')=0
      or pg_catalog.strpos(v_execute_body,'public.research_referral_v1_touch_attribution')=0 then
      raise exception 'Referral touch-attribution dispatcher drift';
    end if;
    v_probe:=public.research_referral_v1_execute('attributionForTouch',pg_catalog.jsonb_build_object(
      'touchId','00000000-0000-4000-8000-000000000005','subjectKeyHash',pg_catalog.repeat('0',64),
      'actorAuthUserId','00000000-0000-4000-8000-000000000006'));
    if v_probe is distinct from '{"ok":true,"value":{"partnerId":null,"eligible":false}}'::jsonb then raise exception 'Referral touch-attribution operation drift'; end if;
    v_schema:='gen2_referral_v1_transfer_touch_20260921';
  end if;
  return pg_catalog.jsonb_build_object('ok',true,'value',pg_catalog.jsonb_build_object('schemaVersion',v_schema));
end $authority$;

revoke all on function public.research_referral_v1_guard(),public.research_referral_v1_identity_guard(),
  public.research_referral_v1_privacy_begin(uuid,text),public.research_referral_v1_privacy_finalize(text),
  public.research_referral_v1_privacy_work_guard(),public.research_referral_v1_partner_availability(uuid,uuid),
  public.research_referral_v1_availability(uuid,uuid),public.research_referral_v1_link_json(uuid),
  public.research_referral_v1_binding_json(text),public.research_referral_v1_effective_binding_json(text),
  public.research_referral_v1_binding_at_json(text,timestamp with time zone),
  public.research_referral_v1_transfer_json(uuid),public.research_referral_v1_transfer_binding_json(uuid),
  public.research_referral_v1_binding_availability(text,uuid),public.research_referral_v1_execute(text,jsonb),
  public.research_referral_v1_authority() from public,anon,authenticated,service_role;
grant execute on function public.research_referral_v1_execute(text,jsonb),public.research_referral_v1_authority() to service_role;
select public.research_referral_v1_authority();
commit;
