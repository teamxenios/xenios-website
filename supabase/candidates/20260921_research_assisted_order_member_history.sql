-- CANDIDATE ONLY. Not registered/applied to any managed database.
-- Read-only inverse of canonical M71 actor_member_id ownership. No email join,
-- anonymous-session claim, new store, provider call, data mutation or money assertion.
-- Also fixes the exact source-proven legacy nullable-boolean authorization
-- guard before exposing the new status projection. M71 file bytes are untouched.
-- Deploy source safely before this function: an absent RPC is unavailable.
-- Rehearse against the exact canonical M71 first. Managed application needs
-- separate approval; rollback drops the two new functions but MUST retain the
-- fail-closed canonical authorization correction (never restore a known leak).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare v_table text; v_role text;
begin
  -- FORCE RLS without policies intentionally denies even table owners. A
  -- definer lacking bypass would falsely certify every owned history empty.
  if not exists (select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'assisted member history requires a reviewed bypass-RLS function owner';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_catalog.pg_roles where rolname=v_role) then
      raise exception 'assisted member history requires role %', v_role;
    end if;
  end loop;
  if pg_catalog.to_regprocedure('public.research_assisted_order_status(text,uuid,text,text)') is null then
    raise exception 'assisted member history requires canonical M71 status authority';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner
    where p.oid='public.research_assisted_order_status(text,uuid,text,text)'::regprocedure
      and p.prosecdef and (r.rolsuper or r.rolbypassrls))
    or pg_catalog.has_function_privilege('anon','public.research_assisted_order_status(text,uuid,text,text)','EXECUTE')
    or pg_catalog.has_function_privilege('authenticated','public.research_assisted_order_status(text,uuid,text,text)','EXECUTE')
    or not pg_catalog.has_function_privilege('service_role','public.research_assisted_order_status(text,uuid,text,text)','EXECUTE') then
    raise exception 'assisted member history requires canonical status authority and service-only ACL';
  end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('research_assisted_order_member_history','research_assisted_order_customer_status')) then
    raise exception 'assisted member history refuses replay or existing overload';
  end if;
  foreach v_table in array array['research_assisted_order_requests','research_assisted_order_lines','research_assisted_order_events'] loop
    if not exists (select 1 from pg_catalog.pg_class c
      where c.oid=pg_catalog.to_regclass('public.'||v_table) and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception 'assisted member history requires canonical RPC-only table %', v_table;
    end if;
    if exists (
      select 1 from pg_catalog.pg_class c
      cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,'{}'::aclitem[])) a
      left join pg_catalog.pg_roles r on r.oid=a.grantee
      where c.oid=pg_catalog.to_regclass('public.'||v_table)
        and (a.grantee=0 or r.rolname in ('anon','authenticated','service_role'))
    ) then raise exception 'assisted member history refuses direct table grants on %',v_table; end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if pg_catalog.has_table_privilege(v_role,'public.'||v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'assisted member history refuses inherited table grants on %',v_table;
      end if;
    end loop;
  end loop;
  if not exists (select 1 from pg_catalog.pg_index where indexrelid=pg_catalog.to_regclass('public.research_assisted_order_requests_member_idx') and indisvalid) then
    raise exception 'assisted member history requires canonical member index';
  end if;
end;
$preflight$;

do $canonical_authorization_correction$
declare
  v_before pg_catalog.pg_proc%rowtype;
  v_after pg_catalog.pg_proc%rowtype;
  v_source text;
  v_definition text;
begin
  select * into strict v_before from pg_catalog.pg_proc
    where oid='public.research_assisted_order_status(text,uuid,text,text)'::regprocedure;
  v_source := pg_catalog.replace(v_before.prosrc,E'\r\n',E'\n');
  -- MD5 of the complete normalized prosrc extracted from canonical M71,
  -- 20260815150000_research_assisted_order_bridge.sql. Reject every other body.
  if pg_catalog.md5(v_source)<>'1895ece151ffc91a5495548b25adb3b9'
    or (pg_catalog.length(v_source)-pg_catalog.length(pg_catalog.replace(v_source,'if not v_authorized then','')))
       <>pg_catalog.length('if not v_authorized then') then
    raise exception 'assisted member history canonical status body drift or correction replay';
  end if;
  -- FALSE OR NULL OR FALSE is NULL. IF NOT NULL does not take the denial
  -- branch. Only an explicitly TRUE canonical credential may permit a read.
  v_definition := pg_catalog.pg_get_functiondef(v_before.oid);
  execute pg_catalog.replace(v_definition,'if not v_authorized then','if v_authorized is not true then');
  select * into strict v_after from pg_catalog.pg_proc where oid=v_before.oid;
  if pg_catalog.replace(v_after.prosrc,E'\r\n',E'\n')
      <>pg_catalog.replace(v_source,'if not v_authorized then','if v_authorized is not true then')
    or v_after.proowner<>v_before.proowner
    or v_after.proacl is distinct from v_before.proacl
    or v_after.proconfig is distinct from v_before.proconfig
    or v_after.proargtypes<>v_before.proargtypes
    or v_after.prorettype<>v_before.prorettype
    or v_after.prosecdef<>v_before.prosecdef then
    raise exception 'assisted member history canonical status postcondition failed';
  end if;
end;
$canonical_authorization_correction$;

create function public.research_assisted_order_member_history(p_member_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_result jsonb;
begin
  if p_member_id is null then raise exception 'member identity required' using errcode='22023'; end if;
  -- The trusted API passes research_members.id from its verified guard. The
  -- service-only grant below prevents buyers from selecting this parameter.
  -- Read 101 indexed records once: 100 displayed + one sentinel proving the
  -- bounded result is partial. No OFFSET walk or misleading total count.
  with owned as materialized (
    select r.* from public.research_assisted_order_requests r
    where r.actor_member_id=p_member_id
    order by r.created_at desc,r.id desc limit 101
  ), page as (
    select * from owned order by created_at desc,id desc limit 100
  )
  select pg_catalog.jsonb_build_object(
    'schemaVersion','assisted_member_history_v1',
    'memberId',p_member_id,
    'complete',(select pg_catalog.count(*)<=100 from owned),
    'requests',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'actorMemberId',r.actor_member_id,
      'kind','assisted_request',
      'requestId',r.id,
      'publicReference',r.public_reference,
      'status',r.status,
      'createdAt',r.created_at,
      'updatedAt',r.updated_at,
      'estimatedTotalCents',r.estimated_total_cents,
      'currency',r.currency,
      'lines',(
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'productName',l.product_name,'specification',l.specification,
          'quantity',l.quantity,'lineEstimateCents',l.line_estimate_cents
        ) order by l.created_at,l.id),'[]'::jsonb)
        from (select * from public.research_assisted_order_lines
          where request_id=r.id order by created_at,id limit 201) l
      ),
      -- ONLY the shipped evidence reference is customer-visible. Never leak
      -- actor ids, internal notes, payment/agreement references or documents.
      'trackingReference',(
        select case when pg_catalog.jsonb_typeof(e.evidence->'trackingId')='string'
          then nullif(pg_catalog.btrim(e.evidence->>'trackingId'),'') else null end
        from public.research_assisted_order_events e
        where e.request_id=r.id and e.status='shipped'
        order by e.occurred_at desc,e.id desc limit 1
      )
    ) order by r.created_at desc,r.id desc),'[]'::jsonb)
  ) into v_result from page r;
  return v_result;
end;
$function$;

revoke all on function public.research_assisted_order_member_history(uuid) from public,anon,authenticated,service_role;
grant execute on function public.research_assisted_order_member_history(uuid) to service_role;

-- Extend the customer status projection WITHOUT replacing the canonical M71
-- authorization function. Its existing member/session/token authorization is
-- the sole door; null remains null before any tracking lookup is attempted.
create function public.research_assisted_order_customer_status(
  p_public_reference text,
  p_member_id uuid default null,
  p_early_access_session_hash text default null,
  p_status_token_hash text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $status$
declare v_status jsonb; v_tracking text;
begin
  v_status := public.research_assisted_order_status(p_public_reference,p_member_id,p_early_access_session_hash,p_status_token_hash);
  if v_status is null then return null; end if;
  select case when pg_catalog.jsonb_typeof(e.evidence->'trackingId')='string'
    then nullif(pg_catalog.btrim(e.evidence->>'trackingId'),'') else null end
    into v_tracking
  from public.research_assisted_order_events e
  join public.research_assisted_order_requests r on r.id=e.request_id
  where r.id=(v_status->>'requestId')::uuid and r.public_reference=p_public_reference and e.status='shipped'
  order by e.occurred_at desc,e.id desc limit 1;
  return v_status || pg_catalog.jsonb_build_object('trackingReference',v_tracking);
end;
$status$;
revoke all on function public.research_assisted_order_customer_status(text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.research_assisted_order_customer_status(text,uuid,text,text) to service_role;

do $postflight$
begin
  if pg_catalog.has_function_privilege('anon','public.research_assisted_order_member_history(uuid)','EXECUTE')
    or pg_catalog.has_function_privilege('authenticated','public.research_assisted_order_member_history(uuid)','EXECUTE')
    or not pg_catalog.has_function_privilege('service_role','public.research_assisted_order_member_history(uuid)','EXECUTE')
    or pg_catalog.has_function_privilege('anon','public.research_assisted_order_customer_status(text,uuid,text,text)','EXECUTE')
    or pg_catalog.has_function_privilege('authenticated','public.research_assisted_order_customer_status(text,uuid,text,text)','EXECUTE')
    or not pg_catalog.has_function_privilege('service_role','public.research_assisted_order_customer_status(text,uuid,text,text)','EXECUTE') then
    raise exception 'assisted member history ACL verification failed';
  end if;
end;
$postflight$;
commit;
