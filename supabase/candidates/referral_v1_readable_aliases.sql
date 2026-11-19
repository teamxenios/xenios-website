-- Optional SOURCE CANDIDATE. Aliases locate existing V1 links only. No partner,
-- customer, referral binding, commission, role activation or historical rewrite.
begin;
set local lock_timeout='5s';
do $$ begin
  if to_regprocedure('public.research_referral_v1_authority()') is null or
     to_regprocedure('public.research_referral_v1_link_json(uuid)') is null then
    raise exception 'readable aliases require canonical Referral V1';
  end if;
end $$;
create schema if not exists referral_alias_v1_private;
revoke all on schema referral_alias_v1_private from public,anon,authenticated,service_role;
create table if not exists referral_alias_v1_private.aliases (
  code text primary key check(code ~ '^[A-Z0-9][A-Z0-9-]{2,23}$'),
  link_id uuid not null unique references public.research_partner_links(id) on delete cascade,
  assigned_by uuid not null,
  assigned_at timestamptz not null default clock_timestamp()
);
-- The immutable assignment row is its actor/time audit. Exact commands also
-- retain their own bounded receipt; alias and receipt commit in one transaction.
create table if not exists referral_alias_v1_private.receipts (
  actor_id uuid not null, idempotency_key text not null check(idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  link_id uuid not null references public.research_partner_links(id) on delete cascade,
  code text not null references referral_alias_v1_private.aliases(code) on delete cascade,
  recorded_at timestamptz not null default clock_timestamp(), primary key(actor_id,idempotency_key)
);
-- Erased public codes cannot later point at a different link. The tombstone
-- retains only a digest, with no actor, customer, partner or link reference.
create table if not exists referral_alias_v1_private.retired_codes (
  code_hash text primary key check(code_hash ~ '^[a-f0-9]{64}$')
);
revoke all on all tables in schema referral_alias_v1_private from public,anon,authenticated,service_role;
alter table referral_alias_v1_private.aliases enable row level security;
alter table referral_alias_v1_private.receipts enable row level security;
alter table referral_alias_v1_private.retired_codes enable row level security;
create or replace function referral_alias_v1_private.retire_alias() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  insert into referral_alias_v1_private.retired_codes(code_hash)
    values(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(old.code,'UTF8')),'hex')) on conflict do nothing;
  return old;
end $$;
revoke all on function referral_alias_v1_private.retire_alias() from public,anon,authenticated,service_role;
drop trigger if exists retire_alias on referral_alias_v1_private.aliases;
create trigger retire_alias after delete on referral_alias_v1_private.aliases
  for each row execute function referral_alias_v1_private.retire_alias();

-- Distinct prefix: do not weaken or rewrite V1's guarded helper/entrypoint set.
create or replace function public.research_referral_alias_v1_execute(p_operation text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a uuid; v_code text; v_link uuid; v_key text; v_owner uuid; v_created boolean:=false;
  v_own jsonb; v_authority jsonb; v_result jsonb; v_count bigint;
  r referral_alias_v1_private.receipts; x referral_alias_v1_private.aliases;
  l public.research_partner_links;
begin
  -- The existing owned harness logs in as service_role directly; PostgREST
  -- selects that same role from its authenticator connection. Neither path is
  -- an authenticated customer role. EXECUTE is also revoked from API users.
  if current_setting('role',true) is distinct from 'service_role' and session_user is distinct from 'service_role' then
    raise exception using errcode='42501',message='referral_alias_backend_only';
  end if;
  if jsonb_typeof(p_input) is distinct from 'object' or p_operation is null or p_operation not in ('assign','list','resolve') then
    return jsonb_build_object('ok',false,'reason','invalid_input');
  end if;
  v_authority:=public.research_referral_v1_authority();
  if v_authority->>'ok' is distinct from 'true' or v_authority->'value'->>'schemaVersion' is distinct from 'gen2_referral_v1_transfer_touch_20260921' then
    return jsonb_build_object('ok',false,'reason','unavailable'); end if;
  if p_operation='resolve' then
    if exists(select 1 from jsonb_object_keys(p_input) k where k<>'code') or
      coalesce(p_input->>'code','') !~ '^[A-Z0-9][A-Z0-9-]{2,23}$' then return jsonb_build_object('ok',false,'reason','invalid_input'); end if;
    select * into x from referral_alias_v1_private.aliases where code=p_input->>'code';
    if not found then return jsonb_build_object('ok',false,'reason','invalid_link'); end if;
    if public.research_referral_v1_availability(x.link_id,null) is distinct from 'ready' then return jsonb_build_object('ok',false,'reason','invalid_link'); end if;
    return jsonb_build_object('ok',true,'value',jsonb_build_object('alias',jsonb_build_object(
      'code',x.code,'assignedAt',x.assigned_at,'link',public.research_referral_v1_link_json(x.link_id))));
  end if;
  if coalesce(p_input->>'actorAuthUserId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
    return jsonb_build_object('ok',false,'reason','invalid_input'); end if;
  a:=(p_input->>'actorAuthUserId')::uuid;
  if p_operation='assign' then perform pg_advisory_xact_lock(9042026,1); end if;
  -- Reuse the canonical Auth->member->partner mapping and its current row locks.
  v_own:=public.research_referral_v1_execute('listOwn',jsonb_build_object('actorAuthUserId',a));
  if v_own->>'ok' is distinct from 'true' then return v_own; end if;
  v_owner:=(v_own->'value'->>'partnerId')::uuid;
  if p_operation='list' then
    if exists(select 1 from jsonb_object_keys(p_input) k where k<>'actorAuthUserId') then return jsonb_build_object('ok',false,'reason','invalid_input'); end if;
    select count(*) into v_count from referral_alias_v1_private.aliases q join public.research_partner_links p on p.id=q.link_id
      where p.partner_id=v_owner and p.referral_version=1;
    if v_count>100 then return jsonb_build_object('ok',false,'reason','unavailable'); end if;
    select coalesce(jsonb_agg(jsonb_build_object('code',q.code,'assignedAt',q.assigned_at,
      'link',public.research_referral_v1_link_json(q.link_id)) order by q.assigned_at,q.code),'[]') into v_result
      from referral_alias_v1_private.aliases q join public.research_partner_links p on p.id=q.link_id
      where p.partner_id=v_owner and p.referral_version=1;
    return jsonb_build_object('ok',true,'value',jsonb_build_object('aliases',v_result));
  end if;
  if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('actorAuthUserId','linkId','code','idempotencyKey')) or
     coalesce(p_input->>'code','') !~ '^[A-Z0-9][A-Z0-9-]{2,23}$' or
     coalesce(p_input->>'linkId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or
     coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{16,128}$' then return jsonb_build_object('ok',false,'reason','invalid_input'); end if;
  if v_owner is null or v_own->'value'->>'eligible' is distinct from 'true' then return jsonb_build_object('ok',false,'reason','not_eligible'); end if;
  v_code:=p_input->>'code'; v_link:=(p_input->>'linkId')::uuid; v_key:=p_input->>'idempotencyKey';
  select * into l from public.research_partner_links where id=v_link and partner_id=v_owner and referral_version=1 for share;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if public.research_referral_v1_availability(l.id,null) is distinct from 'ready' then return jsonb_build_object('ok',false,'reason','invalid_link'); end if;
  select * into r from referral_alias_v1_private.receipts where actor_id=a and idempotency_key=v_key;
  if found then
    if r.link_id<>v_link or r.code<>v_code then return jsonb_build_object('ok',false,'reason','idempotency_conflict'); end if;
  else
    select * into x from referral_alias_v1_private.aliases where code=v_code or link_id=v_link;
    if found and (x.link_id<>v_link or x.code<>v_code) then return jsonb_build_object('ok',false,'reason','idempotency_conflict'); end if;
    if not found then
      if exists(select 1 from referral_alias_v1_private.retired_codes where code_hash=encode(sha256(convert_to(v_code,'UTF8')),'hex')) then
        return jsonb_build_object('ok',false,'reason','idempotency_conflict'); end if;
      select count(*) into v_count from referral_alias_v1_private.aliases q join public.research_partner_links p on p.id=q.link_id where p.partner_id=v_owner;
      if v_count>=100 then return jsonb_build_object('ok',false,'reason','invalid_input'); end if;
      insert into referral_alias_v1_private.aliases(code,link_id,assigned_by) values(v_code,v_link,a);
      v_created:=true;
    end if;
    insert into referral_alias_v1_private.receipts(actor_id,idempotency_key,link_id,code) values(a,v_key,v_link,v_code);
  end if;
  select * into x from referral_alias_v1_private.aliases where code=v_code and link_id=v_link;
  return jsonb_build_object('ok',true,'value',jsonb_build_object('alias',jsonb_build_object(
    'code',x.code,'assignedAt',x.assigned_at,'link',public.research_referral_v1_link_json(x.link_id)),'created',v_created));
end $$;
revoke all on function public.research_referral_alias_v1_execute(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_referral_alias_v1_execute(text,jsonb) to service_role;
do $$
declare t regclass; expected_owner oid; p pg_catalog.pg_proc;
begin
  select relowner into expected_owner from pg_catalog.pg_class where oid='public.research_partner_links'::regclass;
  foreach t in array array['referral_alias_v1_private.aliases'::regclass,'referral_alias_v1_private.receipts'::regclass,'referral_alias_v1_private.retired_codes'::regclass] loop
    if exists(select 1 from pg_catalog.pg_class c where c.oid=t and (c.relowner<>expected_owner or c.relkind<>'r' or not c.relrowsecurity)) or
       exists(select 1 from pg_catalog.pg_class c cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
         where c.oid=t and a.grantee<>c.relowner) then raise exception 'readable alias table owner/privilege drift'; end if;
  end loop;
  if (select array_agg(attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull::text order by attnum)
    from pg_catalog.pg_attribute where attrelid='referral_alias_v1_private.aliases'::regclass and attnum>0 and not attisdropped)
    is distinct from array['code:text:true','link_id:uuid:true','assigned_by:uuid:true','assigned_at:timestamp with time zone:true']::text[] or
    (select array_agg(attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull::text order by attnum)
    from pg_catalog.pg_attribute where attrelid='referral_alias_v1_private.receipts'::regclass and attnum>0 and not attisdropped)
    is distinct from array['actor_id:uuid:true','idempotency_key:text:true','link_id:uuid:true','code:text:true','recorded_at:timestamp with time zone:true']::text[] then
    raise exception 'readable alias table shape drift';
  end if;
  if (select array_agg(attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull::text order by attnum)
    from pg_catalog.pg_attribute where attrelid='referral_alias_v1_private.retired_codes'::regclass and attnum>0 and not attisdropped)
    is distinct from array['code_hash:text:true']::text[] then raise exception 'readable alias tombstone shape drift'; end if;
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='referral_alias_v1_private.aliases'::regclass and contype='p' and conkey=array[1]::smallint[]) or
     not exists(select 1 from pg_catalog.pg_constraint where conrelid='referral_alias_v1_private.aliases'::regclass and contype='u' and conkey=array[2]::smallint[]) or
     not exists(select 1 from pg_catalog.pg_constraint where conrelid='referral_alias_v1_private.aliases'::regclass and contype='f' and conkey=array[2]::smallint[] and confrelid='public.research_partner_links'::regclass and confdeltype='c') or
     not exists(select 1 from pg_catalog.pg_constraint where conrelid='referral_alias_v1_private.receipts'::regclass and contype='p' and conkey=array[1,2]::smallint[]) or
     not exists(select 1 from pg_catalog.pg_constraint where conrelid='referral_alias_v1_private.receipts'::regclass and contype='f' and conkey=array[3]::smallint[] and confrelid='public.research_partner_links'::regclass and confdeltype='c') or
     not exists(select 1 from pg_catalog.pg_constraint where conrelid='referral_alias_v1_private.receipts'::regclass and contype='f' and conkey=array[4]::smallint[] and confrelid='referral_alias_v1_private.aliases'::regclass and confdeltype='c') then
    raise exception 'readable alias constraint drift';
  end if;
  select * into p from pg_catalog.pg_proc where oid='public.research_referral_alias_v1_execute(text,jsonb)'::regprocedure;
  if p.proowner<>expected_owner or exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where a.grantee<>p.proowner and (a.grantee is distinct from to_regrole('service_role')::oid or a.is_grantable)) then
    raise exception 'readable alias RPC owner/privilege drift';
  end if;
end $$;
commit;
