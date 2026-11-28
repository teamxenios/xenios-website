-- SOURCE CANDIDATE ONLY. Explicit optional projection over the existing session
-- table; no normal admission switch, schema activation, session mint or renewal.
begin;
set local lock_timeout='5s';

do $preflight$
begin
  if pg_catalog.to_regclass('public.research_private_early_access_sessions') is null then
    raise exception 'private_access_live_expiry: canonical sessions table required';
  end if;
end
$preflight$;

create or replace function public.research_private_early_access_live_session_expiry(
  p_session_hash text,
  p_owner_id uuid,
  p_access_role text
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path=pg_catalog
as $live_expiry$
declare
  v_expiry timestamptz;
  v_issued timestamptz;
  v_now timestamptz;
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception using errcode='42501',message='private_access_backend_only';
  end if;
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$'
     or p_owner_id is null or p_access_role is distinct from 'private_early_access_member' then
    return null;
  end if;
  select s.expires_at,s.issued_at into v_expiry,v_issued
  from public.research_private_early_access_sessions s
  where s.session_hash=p_session_hash and s.owner_id=p_owner_id and s.access_role=p_access_role
    and s.revoked_at is null and s.issued_at<=pg_catalog.clock_timestamp()
    and pg_catalog.isfinite(s.expires_at) and s.expires_at>pg_catalog.clock_timestamp()
  for share;
  -- FOR SHARE also conflicts with a non-key revoked_at update. Recheck time
  -- after any lock wait; this is only a current projection-transaction snapshot,
  -- not a lock held through a later claim or a long-lived proof capability.
  v_now:=pg_catalog.clock_timestamp();
  if not found or v_issued>v_now or not pg_catalog.isfinite(v_expiry) or v_expiry<=v_now then return null; end if;
  return v_expiry;
end
$live_expiry$;

revoke all on function public.research_private_early_access_live_session_expiry(text,uuid,text) from public;
do $role_boundary$
declare v_role text;
begin
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if pg_catalog.to_regrole(v_role) is not null then
      execute pg_catalog.format('revoke all on function public.research_private_early_access_live_session_expiry(text,uuid,text) from %I',v_role);
    end if;
  end loop;
  if pg_catalog.to_regrole('service_role') is not null then
    grant execute on function public.research_private_early_access_live_session_expiry(text,uuid,text) to service_role;
  end if;
end
$role_boundary$;

-- A preexisting foreign owner or additional ACL must fail rather than retain
-- wider access when this candidate is reapplied. No table privilege is granted.
do $shape_boundary$
declare v_proc pg_catalog.pg_proc;
begin
  select * into v_proc from pg_catalog.pg_proc where oid=
    'public.research_private_early_access_live_session_expiry(text,uuid,text)'::regprocedure;
  if v_proc.proowner<>(select relowner from pg_catalog.pg_class where oid='public.research_private_early_access_sessions'::regclass)
     or exists(select 1 from pg_catalog.aclexplode(coalesce(v_proc.proacl,pg_catalog.acldefault('f',v_proc.proowner))) a
       where a.grantee<>v_proc.proowner and (a.grantee is distinct from pg_catalog.to_regrole('service_role')::oid
         or a.privilege_type<>'EXECUTE' or a.is_grantable)) then
    raise exception 'private_access_live_expiry: unexpected owner or execute privilege';
  end if;
end
$shape_boundary$;

commit;
