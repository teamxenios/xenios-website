-- SOURCE-ONLY CANDIDATE. Not a registered or applied migration.
-- Requires a disposable rehearsal and reviewed migration-DAG placement.
-- Extends private request intake, NOT commercial order/payment authority.
begin;
create schema request_intent_private;
revoke all on schema request_intent_private from public, anon, authenticated, service_role;
grant usage on schema request_intent_private to service_role;

create function request_intent_private.only_keys(value jsonb, allowed text[])
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'object'
    and not exists (select 1 from jsonb_object_keys(
      case when jsonb_typeof(value) = 'object' then value else '{}'::jsonb end
    ) k where not (k = any(allowed)));
$$;
revoke all on function request_intent_private.only_keys(jsonb,text[]) from public, anon, authenticated, service_role;

create function request_intent_private.valid_lines(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare entry jsonb;
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(value) not between 1 and 200 then return false; end if;
  for entry in select jsonb_array_elements(value) loop
    if not request_intent_private.only_keys(entry, array[
      'productId','variantId','sourceVariantId','productName','specification','family','workflowMode',
      'quantity','researchUseOnly','clinicalReviewRequired','sourceDisplayState','sourceVariantDisplayState',
      'sourceRefusal','catalogVersion','reviewState'
    ]) then return false; end if;
    if entry->>'reviewState' is distinct from 'pending'
      or jsonb_typeof(entry->'quantity') is distinct from 'number'
      or (entry->>'quantity') !~ '^[0-9]+$'
      or (entry->>'quantity')::numeric not between 1 and 100
      or jsonb_typeof(entry->'researchUseOnly') is distinct from 'boolean'
      or jsonb_typeof(entry->'clinicalReviewRequired') is distinct from 'boolean'
      or entry->>'workflowMode' is null
      or entry->>'workflowMode' not in ('direct_order_request','provider_request','request_pricing','request_activation','availability_review')
    then return false; end if;
    if exists (select 1 from unnest(array[
      'productId','variantId','sourceVariantId','productName','family',
      'sourceDisplayState','sourceVariantDisplayState','catalogVersion'
    ]) k where jsonb_typeof(entry->k) is distinct from 'string'
      or length(entry->>k) not between 1 and 300) then return false; end if;
    if jsonb_typeof(entry->'specification') is distinct from 'string'
      and jsonb_typeof(entry->'specification') is distinct from 'null' then return false; end if;
    if jsonb_typeof(entry->'sourceRefusal') is distinct from 'string'
      and jsonb_typeof(entry->'sourceRefusal') is distinct from 'null' then return false; end if;
    if entry->>'workflowMode' = 'provider_request'
      and entry->'clinicalReviewRequired' is distinct from 'true'::jsonb then return false; end if;
    if entry->>'sourceDisplayState' in ('coming_soon','planned')
      or entry->>'sourceVariantDisplayState' in ('coming_soon','planned')
      or entry->>'sourceRefusal' = 'non_merchandise_family' then return false; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(value) e
    group by e->>'productId', e->>'variantId' having count(*) > 1) then return false; end if;
  return true;
exception when others then return false;
end;
$$;
revoke all on function request_intent_private.valid_lines(jsonb) from public, anon, authenticated, service_role;

create function request_intent_private.valid_contact(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare address jsonb; k text;
begin
  if not request_intent_private.only_keys(value,array[
    'fullLegalName','email','mobilePhone','organizationName','ageConfirmed',
    'shippingAddress','billingSameAsShipping','billingAddress'
  ]) then return false; end if;
  if value->'ageConfirmed' is distinct from 'true'::jsonb
    or jsonb_typeof(value->'billingSameAsShipping') is distinct from 'boolean'
    or octet_length(value::text) > 6000 then return false; end if;
  foreach k in array array['fullLegalName','email','mobilePhone'] loop
    if jsonb_typeof(value->k) is distinct from 'string' or length(value->>k) not between 1 and 320 then return false; end if;
  end loop;
  foreach k in array array['shippingAddress','billingAddress'] loop
    address := value->k;
    if not request_intent_private.only_keys(address,array['line1','line2','city','region','postalCode','countryCode'])
      or jsonb_typeof(address) is distinct from 'object' then return false; end if;
    if exists (select 1 from unnest(array['line1','city','region','postalCode','countryCode']) f
      where jsonb_typeof(address->f) is distinct from 'string' or length(address->>f) not between 1 and 200)
      then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function request_intent_private.valid_contact(jsonb) from public, anon, authenticated, service_role;

create function request_intent_private.valid_agreements(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare entry jsonb; stamp timestamptz;
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(value) not between 1 and 64 then return false; end if;
  for entry in select jsonb_array_elements(value) loop
    if not request_intent_private.only_keys(entry,array['kind','version','accepted','acceptedAt'])
      or entry->'accepted' is distinct from 'true'::jsonb then return false; end if;
    if exists (select 1 from unnest(array['kind','version','acceptedAt']) k
      where jsonb_typeof(entry->k) is distinct from 'string'
      or length(entry->>k) not between 1 and 80) then return false; end if;
    stamp := (entry->>'acceptedAt')::timestamptz;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function request_intent_private.valid_agreements(jsonb) from public, anon, authenticated, service_role;

create table request_intent_private.requests (
  id uuid primary key,
  public_reference text not null unique check (public_reference = 'XRI-' || upper(replace(id::text,'-',''))),
  owner_hash text not null check (owner_hash ~ '^[a-f0-9]{64}$'),
  attempt_hash text not null check (attempt_hash ~ '^[a-f0-9]{64}$'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending_review' check (status = 'pending_review'),
  contact jsonb not null check (request_intent_private.valid_contact(contact)),
  agreements jsonb not null check (request_intent_private.valid_agreements(agreements)),
  lines jsonb not null check (request_intent_private.valid_lines(lines)),
  created_at timestamptz not null default now(),
  unique (owner_hash, attempt_hash)
);
create table request_intent_private.access_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references request_intent_private.requests(id),
  event_type text not null check (event_type in ('submitted','staff_read','queue_list')),
  actor_user_id uuid,
  occurred_at timestamptz not null default now()
);
alter table request_intent_private.requests enable row level security;
alter table request_intent_private.requests force row level security;
alter table request_intent_private.access_events enable row level security;
alter table request_intent_private.access_events force row level security;
revoke all on all tables in schema request_intent_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema request_intent_private from public, anon, authenticated, service_role;
-- No RLS policies: no direct table access. Only the narrowly granted RPCs below.
-- Do not add this schema to exposed Data API schemas.

create function request_intent_private.deny_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception using errcode='42501',message='request_intent_is_immutable'; end;
$$;
revoke all on function request_intent_private.deny_mutation() from public, anon, authenticated, service_role;
create trigger request_intent_immutable before update or delete on request_intent_private.requests
  for each row execute function request_intent_private.deny_mutation();
create trigger request_intent_audit_immutable before update or delete on request_intent_private.access_events
  for each row execute function request_intent_private.deny_mutation();

create function request_intent_private.receipt(row_value request_intent_private.requests)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('kind','unapproved_selection_request',
    'requestId',(row_value).id,'publicReference',(row_value).public_reference,
    'status',(row_value).status,'createdAt',(row_value).created_at);
$$;
revoke all on function request_intent_private.receipt(request_intent_private.requests) from public, anon, authenticated, service_role;

create function request_intent_private.find_attempt(p_owner_hash text,p_attempt_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare stored request_intent_private.requests;
begin
  -- This backend-only RPC relies on canonical server session resolution for
  -- owner_hash. anon/authenticated cannot call it or choose another owner.
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception using errcode='42501',message='request_intent_backend_required';
  end if;
  select * into stored from request_intent_private.requests
    where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash;
  if not found then return null; end if;
  return jsonb_build_object('receipt',request_intent_private.receipt(stored),'fingerprint',stored.fingerprint);
end;
$$;
revoke all on function request_intent_private.find_attempt(text,text) from public, anon, authenticated, service_role;
grant execute on function request_intent_private.find_attempt(text,text) to service_role;

create function request_intent_private.create_or_replay(
  p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare stored request_intent_private.requests; request_id uuid;
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception using errcode='42501',message='request_intent_backend_required';
  end if;
  if not request_intent_private.only_keys(p_detail,array[
    'kind','requestId','publicReference','status','createdAt','contact','agreements','lines'
  ]) or p_detail->>'kind' is distinct from 'unapproved_selection_request'
    or p_detail->>'status' is distinct from 'pending_review' then
    raise exception using errcode='22023',message='request_intent_invalid';
  end if;
  request_id := (p_detail->>'requestId')::uuid;
  insert into request_intent_private.requests(id,public_reference,owner_hash,attempt_hash,fingerprint,contact,agreements,lines)
    values(request_id,'XRI-'||upper(replace(request_id::text,'-','')),p_owner_hash,p_attempt_hash,p_fingerprint,
      p_detail->'contact',p_detail->'agreements',p_detail->'lines')
    on conflict(owner_hash,attempt_hash) do nothing returning * into stored;
  if found then
    insert into request_intent_private.access_events(request_id,event_type) values(stored.id,'submitted');
  else
    -- A second statement sees the committed winner under READ COMMITTED.
    select * into strict stored from request_intent_private.requests
      where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash;
    if stored.fingerprint is distinct from p_fingerprint then
      raise exception using errcode='23505',message='request_intent_attempt_conflict';
    end if;
  end if;
  return jsonb_build_object('receipt',request_intent_private.receipt(stored),'fingerprint',stored.fingerprint);
end;
$$;
revoke all on function request_intent_private.create_or_replay(text,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function request_intent_private.create_or_replay(text,text,text,jsonb) to service_role;

-- Separate existing-registry capability, default absent/denied.
-- This candidate does NOT insert or enable a capability or grant a human role.
-- Deployment needs separately authorized operational adoption and an approved
-- request_intent_pending_read row in public.care_capabilities. The existing
-- whole-Care row and CARE_ENABLED / CARE_ENABLE_APPROVED remain unchanged.
-- Both reads below independently recheck the actor's live assignment and scope.
create function request_intent_private.staff_get(p_request_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; stored request_intent_private.requests;
begin
  -- No direct authenticated/anon RPC. The purpose-specific pending-read guard
  -- forwards a principal from canonical JWT and active-role resolution.
  -- Whole-Care runtime flags neither grant nor block this separate read scope.
  if current_setting('role',true) is distinct from 'service_role'
    or (auth.uid() is not null and auth.uid() is distinct from p_actor_user_id) then
    raise exception using errcode='42501',message='request_intent_backend_required';
  end if;
  actor := p_actor_user_id;
  if actor is null
    or not exists(select 1 from public.care_role_assignments where user_id=actor and role='clinical_admin' and revoked_at is null)
    or not exists(select 1 from public.care_capabilities where capability_key='request_intent_pending_read'
      and state='enabled' and approved_by is not null and approved_at is not null) then
    raise exception using errcode='42501',message='request_intent_private_review_required';
  end if;
  select * into stored from request_intent_private.requests where id=p_request_id;
  if not found then return null; end if;
  insert into request_intent_private.access_events(request_id,event_type,actor_user_id)
    values(stored.id,'staff_read',actor);
  return request_intent_private.receipt(stored)
    || jsonb_build_object('contact',stored.contact,'agreements',stored.agreements,'lines',stored.lines);
end;
$$;
revoke all on function request_intent_private.staff_get(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function request_intent_private.staff_get(uuid,uuid) to service_role;

-- Exposed wrappers are INVOKER only; private implementation grants remain explicit.
create function public.request_intent_find_attempt(p_owner_hash text,p_attempt_hash text)
returns jsonb language sql security invoker set search_path = '' as $$
  select request_intent_private.find_attempt(p_owner_hash,p_attempt_hash);
$$;
revoke all on function public.request_intent_find_attempt(text,text) from public, anon, authenticated, service_role;
grant execute on function public.request_intent_find_attempt(text,text) to service_role;

create function public.request_intent_create_or_replay(p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select request_intent_private.create_or_replay(p_owner_hash,p_attempt_hash,p_fingerprint,p_detail);
$$;
revoke all on function public.request_intent_create_or_replay(text,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.request_intent_create_or_replay(text,text,text,jsonb) to service_role;

create function public.request_intent_staff_get(p_request_id uuid,p_actor_user_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select request_intent_private.staff_get(p_request_id,p_actor_user_id);
$$;
revoke all on function public.request_intent_staff_get(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.request_intent_staff_get(uuid,uuid) to service_role;

create function request_intent_private.staff_list(p_actor_user_id uuid,p_page integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare stored request_intent_private.requests; entries jsonb := '[]'::jsonb; total_count bigint;
begin
  if current_setting('role',true) is distinct from 'service_role'
    or (auth.uid() is not null and auth.uid() is distinct from p_actor_user_id)
    or p_actor_user_id is null
    or not exists(select 1 from public.care_role_assignments where user_id=p_actor_user_id and role='clinical_admin' and revoked_at is null)
    or not exists(select 1 from public.care_capabilities where capability_key='request_intent_pending_read'
      and state='enabled' and approved_by is not null and approved_at is not null) then
    raise exception using errcode='42501',message='request_intent_private_review_required';
  end if;
  if p_page is null or p_page not between 1 and 10000 then
    raise exception using errcode='22023',message='request_intent_invalid_page';
  end if;
  select count(*) into total_count from request_intent_private.requests;
  for stored in select * from request_intent_private.requests
    order by created_at desc,id desc limit 25 offset (p_page-1)*25 loop
    entries := entries || jsonb_build_array(request_intent_private.receipt(stored)
      || jsonb_build_object('lineCount',jsonb_array_length(stored.lines)));
    insert into request_intent_private.access_events(request_id,event_type,actor_user_id)
      values(stored.id,'queue_list',p_actor_user_id);
  end loop;
  return jsonb_build_object('items',entries,'total',total_count,'page',p_page,'pageSize',25);
end;
$$;
revoke all on function request_intent_private.staff_list(uuid,integer) from public, anon, authenticated, service_role;
grant execute on function request_intent_private.staff_list(uuid,integer) to service_role;
create function public.request_intent_staff_list(p_actor_user_id uuid,p_page integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select request_intent_private.staff_list(p_actor_user_id,p_page);
$$;
revoke all on function public.request_intent_staff_list(uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.request_intent_staff_list(uuid,integer) to service_role;
commit;
