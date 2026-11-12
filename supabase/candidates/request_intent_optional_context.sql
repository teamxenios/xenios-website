-- SOURCE ONLY. Depends on mixed_catalog_request_intent.sql. Default collection OFF.
-- Optional information is deliberately separate from immutable receipt/contact/audit rows.
begin;
create table request_intent_private.optional_context (
  request_id uuid primary key references request_intent_private.requests(id) on delete cascade,
  goal text check (goal in ('compare_options','understand_details','check_availability','ask_about_process')),
  referral_code text check (referral_code collate "C" ~ '^[A-Za-z0-9][A-Za-z0-9-]{1,23}$'),
  captured_at timestamptz not null default clock_timestamp(),
  check (goal is not null or referral_code is not null)
);
alter table request_intent_private.optional_context enable row level security;
revoke all on table request_intent_private.optional_context from public,anon,authenticated,service_role;

create function request_intent_private.create_with_context(p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb,p_context jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; prior jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception using errcode='42501',message='request_intent_backend_required';
  end if;
  if jsonb_typeof(p_context) is distinct from 'object'
     or not request_intent_private.only_keys(p_context,array['goal','referralCode'])
     or p_context='{}'::jsonb
     or (p_context ? 'goal' and jsonb_typeof(p_context->'goal') is distinct from 'string')
     or (p_context ? 'referralCode' and jsonb_typeof(p_context->'referralCode') is distinct from 'string') then
    raise exception using errcode='22023',message='request_intent_invalid_optional_context';
  end if;
  -- Serialize v2 retries even if the caller deliberately reuses the proposed request UUID.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_hash || ':' || p_attempt_hash,0));
  prior:=request_intent_private.find_attempt(p_owner_hash,p_attempt_hash);
  result:=request_intent_private.create_or_replay(p_owner_hash,p_attempt_hash,p_fingerprint,p_detail);
  -- Existing request replay never resurrects optional data after privacy erasure.
  if prior is null and (result->'receipt'->>'requestId')::uuid = (p_detail->>'requestId')::uuid then
    insert into request_intent_private.optional_context(request_id,goal,referral_code)
    values((p_detail->>'requestId')::uuid,p_context->>'goal',p_context->>'referralCode')
    on conflict (request_id) do nothing;
  end if;
  return result;
end; $$;
create function request_intent_private.staff_get_with_context(p_request_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare detail jsonb; context jsonb;
begin
  -- Performs existing role, identity, purpose, live-assignment and auditable-read checks first.
  detail:=request_intent_private.staff_get(p_request_id,p_actor_user_id);
  if detail is null then return null; end if;
  select jsonb_strip_nulls(jsonb_build_object('goal',c.goal,'referralCode',c.referral_code)) into context
    from request_intent_private.optional_context c where c.request_id=p_request_id;
  if context is null then return detail; end if;
  return detail || jsonb_build_object('optionalIntake',context);
end; $$;
create function public.request_intent_create_with_context(p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb,p_context jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
 select request_intent_private.create_with_context(p_owner_hash,p_attempt_hash,p_fingerprint,p_detail,p_context);
$$;
create function public.request_intent_staff_get_with_context(p_request_id uuid,p_actor_user_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
 select request_intent_private.staff_get_with_context(p_request_id,p_actor_user_id);
$$;
revoke all on function request_intent_private.create_with_context(text,text,text,jsonb,jsonb),
  request_intent_private.staff_get_with_context(uuid,uuid), public.request_intent_create_with_context(text,text,text,jsonb,jsonb),
  public.request_intent_staff_get_with_context(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function request_intent_private.create_with_context(text,text,text,jsonb,jsonb),
  request_intent_private.staff_get_with_context(uuid,uuid), public.request_intent_create_with_context(text,text,text,jsonb,jsonb),
  public.request_intent_staff_get_with_context(uuid,uuid) to service_role;
commit;
