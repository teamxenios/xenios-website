-- CANDIDATE ONLY. No managed apply or new claim registry is authorized here.
-- Companion to unchanged Pack02 20260812_research_account_organizations.sql.
-- Keep the canonical four-argument RPC/ACL. An unexpired consumed challenge is
-- replayable only with its own original atomic customer_ref_bound receipt.
begin;

do $guard$
declare
  expected_owner oid;
  p pg_catalog.pg_proc;
  t regclass;
  event_guard pg_catalog.pg_proc;
begin
  select relowner into expected_owner from pg_catalog.pg_class
    where oid='public.research_members'::regclass;
  foreach t in array array[
    'public.research_account_claim_challenges'::regclass,
    'public.research_customer_account_bindings'::regclass,
    'public.research_account_binding_events'::regclass
  ] loop
    if exists(select 1 from pg_catalog.pg_class c where c.oid=t
        and (c.relowner<>expected_owner or c.relkind<>'r' or not c.relrowsecurity))
      or exists(select 1 from pg_catalog.pg_class c
        cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
        where c.oid=t and a.grantee<>c.relowner and
          (a.grantee is distinct from to_regrole('service_role')::oid or a.is_grantable
            or a.privilege_type not in ('SELECT','INSERT')))
      or exists(select 1 from pg_catalog.pg_rewrite where ev_class=t and rulename<>'_RETURN') then
      raise exception 'account claim replay table authority drift';
    end if;
  end loop;

  select * into p from pg_catalog.pg_proc
    where oid=to_regprocedure('public.research_account_commit_customer_claim(uuid,bytea,uuid,text)');
  if not found or p.proowner<>expected_owner or not p.prosecdef
    or p.proconfig is distinct from array['search_path=""']::text[]
    or p.prorettype<>'text'::regtype or p.proretset or p.prokind<>'f'
    or p.provolatile<>'v' or p.proparallel<>'u' or p.proisstrict or p.proleakproof
    or p.pronargdefaults<>0 or p.proargmodes is not null
    or p.proargnames is distinct from array['p_claim_id','p_token_hash','p_auth_user_id','p_verified_email']::text[]
    or p.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
    or exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      where a.grantee<>p.proowner and
        (a.grantee is distinct from to_regrole('service_role')::oid or a.privilege_type<>'EXECUTE' or a.is_grantable))
    or not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
    or exists(select 1 from pg_catalog.pg_proc q where q.pronamespace=p.pronamespace
      and q.proname=p.proname and q.oid<>p.oid)
    or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')
      not in ('24cf5b2dba9a489f98031bc653bffbf89cfbfd50cbf9c2c34ff5baa4f7fa0908','489d364560c1edc12b77a1a9355ffb908b3077ccd6a18a46d8e3cf9f5518bcec') then
    raise exception 'account claim replay RPC baseline drift';
  end if;

  -- The receipt is trustworthy only while its canonical append-only authority
  -- and trigger are intact. Reject polluted baselines; do not silently repair.
  select * into event_guard from pg_catalog.pg_proc
    where oid=to_regprocedure('public.research_account_binding_events_immutable()');
  if not found or event_guard.proowner<>expected_owner or event_guard.prosecdef
    or event_guard.prorettype<>'trigger'::regtype
    or event_guard.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
    or event_guard.proconfig is distinct from array['search_path=""']::text[]
    or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(event_guard.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>'fbd2b6eba22576e6c8b3e04711ce85fa7fb8ee61fe7888d48caec70c484bb764'
    or (select count(*) from pg_catalog.pg_trigger
      where tgrelid='public.research_account_binding_events'::regclass and not tgisinternal)<>1
    or not exists(select 1 from pg_catalog.pg_trigger
      where tgrelid='public.research_account_binding_events'::regclass
        and tgname='research_account_binding_events_immutable'
        and tgfoid=event_guard.oid and tgtype=27 and tgenabled='O'
        and tgqual is null and tgnargs=0) then
    raise exception 'account claim replay receipt authority drift';
  end if;
end;
$guard$;

create or replace function public.research_account_commit_customer_claim(
  p_claim_id uuid,
  p_token_hash bytea,
  p_auth_user_id uuid,
  p_verified_email text
) returns text
language plpgsql security definer set search_path=''
as $$
declare
  v_claim public.research_account_claim_challenges%rowtype;
  v_auth auth.users%rowtype;
  v_existing public.research_customer_account_bindings%rowtype;
  v_event public.research_account_binding_events%rowtype;
  v_outcome text;
begin
  if p_claim_id is null or p_auth_user_id is null or p_verified_email is null
    or p_token_hash is null or octet_length(p_token_hash)<>32 then return 'invalid'; end if;
  select * into v_auth from auth.users where id=p_auth_user_id for share;
  if not found or v_auth.email_confirmed_at is null
    or lower(v_auth.email) is distinct from lower(trim(p_verified_email)) then
    return 'invalid';
  end if;
  select * into v_claim from public.research_account_claim_challenges
   where id=p_claim_id and auth_user_id=p_auth_user_id for update;
  if not found or not isfinite(v_claim.expires_at) or v_claim.expires_at<=clock_timestamp()
    or v_claim.normalized_email is distinct from lower(trim(p_verified_email))
    or v_claim.token_hash is distinct from p_token_hash then return 'invalid'; end if;

  select * into v_existing from public.research_customer_account_bindings
   where customer_ref=v_claim.customer_ref for update;
  -- The binding lock can wait. Do not extend challenge authority while waiting.
  if v_claim.expires_at<=clock_timestamp() then return 'invalid'; end if;
  if found then
    if v_existing.subject_type<>v_claim.subject_type
       or v_existing.member_id is distinct from v_claim.member_id
       or v_existing.organization_id is distinct from v_claim.organization_id then
      return 'conflict';
    end if;
  end if;

  if v_claim.consumed_at is not null then
    -- Holding the same claim lock serializes concurrent retries. No write below
    -- this branch runs on replay. A binding from another command is insufficient.
    if v_existing.id is null or not isfinite(v_claim.consumed_at)
      or v_claim.consumed_at<v_claim.created_at
      or v_claim.consumed_at>=v_claim.expires_at
      or not isfinite(v_existing.established_at)
      or v_existing.established_at>v_claim.consumed_at
      or (select count(*) from public.research_account_binding_events e
        where e.event_type='customer_ref_bound' and e.detail->>'claimId'=p_claim_id::text)<>1 then
      return 'invalid';
    end if;
    select * into v_event from public.research_account_binding_events e
      where e.event_type='customer_ref_bound' and e.detail->>'claimId'=p_claim_id::text;
    if v_event.auth_user_id is distinct from p_auth_user_id
      or v_event.customer_ref is distinct from v_claim.customer_ref
      or v_event.organization_id is distinct from v_claim.organization_id
      or v_event.organization_user_id is not null
      or v_event.actor_label is distinct from v_claim.normalized_email
      or not isfinite(v_event.occurred_at) or v_event.occurred_at<v_claim.consumed_at
      or v_event.occurred_at>clock_timestamp()
      or coalesce(v_event.detail->>'outcome','') not in ('linked','replayed')
      or v_event.detail is distinct from jsonb_build_object(
        'subjectType',v_claim.subject_type,'outcome',v_event.detail->>'outcome','claimId',p_claim_id)
      or (v_event.detail->>'outcome'='linked' and
        (v_existing.established_from_claim_id<>p_claim_id
          or v_existing.established_by_auth_user_id<>p_auth_user_id)) then
      return 'invalid';
    end if;
    return 'replayed';
  end if;

  -- The unconsumed personal/organization path retains the canonical semantics.
  if v_existing.id is not null then
    v_outcome := 'replayed';
  else
    insert into public.research_customer_account_bindings(
      customer_ref,subject_type,member_id,organization_id,
      established_by_auth_user_id,established_from_claim_id
    ) values (
      v_claim.customer_ref,v_claim.subject_type,v_claim.member_id,v_claim.organization_id,
      p_auth_user_id,p_claim_id
    );
    v_outcome := 'linked';
  end if;
  update public.research_account_claim_challenges set consumed_at=clock_timestamp() where id=p_claim_id;
  insert into public.research_account_binding_events(
    event_type,auth_user_id,organization_id,customer_ref,actor_label,detail
  ) values (
    'customer_ref_bound',p_auth_user_id,v_claim.organization_id,v_claim.customer_ref,
    lower(trim(p_verified_email)),
    jsonb_build_object('subjectType',v_claim.subject_type,'outcome',v_outcome,'claimId',p_claim_id)
  );
  return v_outcome;
end;
$$;
revoke all on function public.research_account_commit_customer_claim(uuid,bytea,uuid,text) from public, anon, authenticated;
grant execute on function public.research_account_commit_customer_claim(uuid,bytea,uuid,text) to service_role;

commit;
