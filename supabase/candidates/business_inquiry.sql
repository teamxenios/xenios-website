-- Candidate only: Root owns canonical numbering, permission companion, mounts and activation.
-- No managed application, role grant, policy approval, mail or customer submission is performed.
begin;
create schema if not exists business_inquiry_private;
revoke all on schema business_inquiry_private from public, anon, authenticated;

create table if not exists business_inquiry_private.configuration (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  visibility_ready boolean not null default false,
  retention_ready boolean not null default false,
  policy_version text,
  policy_binding jsonb,
  check (not enabled or (visibility_ready and retention_ready and policy_version is not null
    and policy_binding is not null and length(policy_version) between 1 and 200
    and jsonb_typeof(policy_binding) = 'object'
    and coalesce(policy_binding->>'scope', '') = 'business_b2b'
    and coalesce(length(policy_binding->>'retentionRecord'), 0) > 0
    and coalesce(length(policy_binding->>'recipientRecord'), 0) > 0))
);
insert into business_inquiry_private.configuration(singleton) values(true) on conflict do nothing;

create table if not exists business_inquiry_private.inquiries (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('BE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 24))),
  owner_hash text not null check(owner_hash ~ '^[a-f0-9]{64}$'),
  attempt_hash text not null check(attempt_hash ~ '^[a-f0-9]{64}$'),
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check(jsonb_typeof(payload) = 'object'),
  provenance text not null default 'web' check(provenance = 'web'),
  category text not null default 'b2b_organization' check(category = 'b2b_organization'),
  submitted_by uuid references auth.users(id),
  organization_id uuid,
  received_at timestamptz not null default clock_timestamp(),
  policy_version text not null,
  policy_binding jsonb not null,
  unique(owner_hash, attempt_hash),
  check((submitted_by is null) = (organization_id is null))
);
create table if not exists business_inquiry_private.workflow (
  inquiry_id uuid primary key references business_inquiry_private.inquiries(id),
  state text not null default 'needs_human_review' check(state in ('needs_human_review', 'linked', 'closed')),
  revision integer not null default 1 check(revision > 0),
  assigned_to uuid references auth.users(id),
  updated_at timestamptz not null default clock_timestamp()
);
create table if not exists business_inquiry_private.events (
  id bigint generated always as identity primary key,
  inquiry_id uuid not null references business_inquiry_private.inquiries(id),
  action text not null check(action in ('received', 'list_read', 'detail_read', 'organization_list_read', 'assigned')),
  actor_id uuid references auth.users(id),
  revision integer not null,
  assigned_to uuid references auth.users(id),
  occurred_at timestamptz not null default clock_timestamp()
);
create table if not exists business_inquiry_private.assignment_commands (
  command_id uuid primary key,
  inquiry_id uuid not null references business_inquiry_private.inquiries(id),
  actor_id uuid not null references auth.users(id),
  expected_revision integer not null,
  assigned_to uuid references auth.users(id),
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
-- Durable transaction intent for the EXISTING notification pipeline, not a provider/worker.
-- No recipient address/contact/referral payload; Root composes the qualified existing outbox handoff.
create table if not exists business_inquiry_private.notice_intents (
  inquiry_id uuid primary key references business_inquiry_private.inquiries(id),
  event_key text not null unique,
  policy_version text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists business_inquiry_org_idx on business_inquiry_private.inquiries(organization_id, id desc);
create index if not exists business_inquiry_events_idx on business_inquiry_private.events(inquiry_id, id);
alter table business_inquiry_private.configuration enable row level security;
alter table business_inquiry_private.inquiries enable row level security;
alter table business_inquiry_private.workflow enable row level security;
alter table business_inquiry_private.events enable row level security;
alter table business_inquiry_private.assignment_commands enable row level security;
alter table business_inquiry_private.notice_intents enable row level security;
revoke all on all tables in schema business_inquiry_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema business_inquiry_private from public, anon, authenticated, service_role;

create or replace function business_inquiry_private.active_identity(p_actor uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from auth.users u where u.id = p_actor and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= now()));
$$;
create or replace function business_inquiry_private.staff_allowed(p_actor uuid, p_assign boolean default false)
returns boolean language sql stable security invoker set search_path = '' as $$
  select business_inquiry_private.active_identity(p_actor)
    and exists(select 1 from public.care_capabilities c
      where c.capability_key = case when p_assign then 'business_inquiry_assign' else 'business_inquiry_read' end
        and c.state = 'enabled' and c.approved_by is not null and c.approved_at is not null)
    and exists(select 1 from public.care_role_assignments r where r.user_id = p_actor
      and r.revoked_at is null and r.granted_at <= now()
      and (r.role = 'business_inquiry_operator' or (not p_assign and r.role = 'business_inquiry_reader')));
$$;
create or replace function business_inquiry_private.organization_allowed(p_actor uuid, p_organization uuid)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare allowed boolean;
begin
  if not business_inquiry_private.active_identity(p_actor)
    or to_regclass('public.research_b2b_buyer_operators') is null
    or to_regclass('public.research_b2b_buyer_relationships') is null
    or to_regclass('public.research_members') is null then return false; end if;
  -- Existing canonical buyer bridge only. Email/domain/referral never establishes membership.
  execute 'select exists(select 1 from public.research_b2b_buyer_operators o
    join public.research_b2b_buyer_relationships r on r.id = o.relationship_id
    join public.research_members m on m.id = o.member_id
    where o.relationship_id = $1 and m.auth_user_id = $2 and m.status = ''active''
      and o.state = ''active'' and r.state = ''active''
      and o.roles && array[''organization_owner'', ''organization_admin'', ''business_buyer'', ''billing_viewer'']::text[])'
    into allowed using p_organization, p_actor;
  return allowed;
end;
$$;

create or replace function business_inquiry_private.valid_payload(p jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; k text;
begin
  if jsonb_typeof(p) <> 'object' or octet_length(p::text) > 50000 then return false; end if;
  if exists(select 1 from jsonb_object_keys(p) t(key) where key <> all(array[
    'contactName','contactEmail','organizationName','organizationType','location','serviceArea','categories',
    'selections','packagingPreference','siteCount','replenishment','services','timing','documentationNeeds','context','referral'])) then return false; end if;
  foreach k in array array['contactName','contactEmail','organizationName','organizationType','location','packagingPreference','replenishment'] loop
    if jsonb_typeof(p->k) is distinct from 'string' or length(btrim(p->>k)) = 0 then return false; end if;
  end loop;
  if length(p->>'contactName') > 120 or length(p->>'contactEmail') > 254
    or (p->>'contactEmail') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(p->>'organizationName') > 180 or length(p->>'location') > 180
    or (p->>'organizationType') <> all(array['clinic','pharmacy','research','retailer','distributor','other'])
    or (p->>'packagingPreference') <> all(array['supplier_brand','organization_brand','not_sure'])
    or (p->>'replenishment') <> all(array['one_time','recurring','not_sure']) then return false; end if;
  foreach k in array array['serviceArea','timing','documentationNeeds','context','referral'] loop
    if p ? k and (jsonb_typeof(p->k) <> 'string' or length(btrim(p->>k)) = 0
      or length(p->>k) > case k when 'documentationNeeds' then 500 when 'context' then 1000 when 'referral' then 200 else 240 end)
      then return false; end if;
  end loop;
  if jsonb_typeof(p->'siteCount') is distinct from 'number' or (p->>'siteCount')::numeric < 1
    or (p->>'siteCount')::numeric > 10000 or trunc((p->>'siteCount')::numeric) <> (p->>'siteCount')::numeric then return false; end if;
  if jsonb_typeof(p->'categories') is distinct from 'array' or jsonb_array_length(p->'categories') not between 1 and 5
    or exists(select 1 from jsonb_array_elements_text(p->'categories') t(v) where v is null or v <> all(array['clinical','research','supplements','topicals','other']))
    or (select count(distinct v) <> count(*) from jsonb_array_elements(p->'categories') t(v)) then return false; end if;
  if jsonb_typeof(p->'services') is distinct from 'array' or jsonb_array_length(p->'services') > 5
    or exists(select 1 from jsonb_array_elements_text(p->'services') t(v) where v is null or v <> all(array['sourcing','labeling','fulfillment','consultation','other']))
    or (select count(distinct v) <> count(*) from jsonb_array_elements(p->'services') t(v)) then return false; end if;
  if jsonb_typeof(p->'selections') is distinct from 'array' or jsonb_array_length(p->'selections') > 40 then return false; end if;
  for item in select value from jsonb_array_elements(p->'selections') loop
    if jsonb_typeof(item) <> 'object' or (select count(*) from jsonb_object_keys(item)) <> 4
      or not item ?& array['description','variant','quantity','unit']
      or jsonb_typeof(item->'description') is distinct from 'string' or length(btrim(item->>'description')) not between 1 and 240
      or jsonb_typeof(item->'variant') is distinct from 'string' or length(btrim(item->>'variant')) not between 1 and 180
      or jsonb_typeof(item->'quantity') is distinct from 'number' or (item->>'quantity')::numeric <= 0
      or (item->>'quantity')::numeric > 1000000 or (item->>'unit') <> all(array['vial','bottle','tube','jar','kit','unit'])
      or jsonb_typeof(item->'unit') is distinct from 'string' then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create or replace function business_inquiry_private.project(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id', i.id, 'reference', i.reference, 'receivedAt', i.received_at,
    'provenance', i.provenance, 'category', i.category, 'state', w.state, 'revision', w.revision,
    'assignedTo', w.assigned_to, 'organizationId', i.organization_id, 'policyVersion', i.policy_version, 'enquiry', i.payload)
  from business_inquiry_private.inquiries i join business_inquiry_private.workflow w on w.inquiry_id = i.id where i.id = p_id;
$$;
create or replace function business_inquiry_private.receipt(p_id uuid, p_replayed boolean) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('reference', reference, 'receivedAt', received_at, 'state', 'needs_human_review', 'replayed', p_replayed)
  from business_inquiry_private.inquiries where id = p_id;
$$;

create or replace function public.research_business_inquiry_submit(
  p_owner_hash text, p_attempt_hash text, p_payload jsonb, p_actor_id uuid default null, p_organization_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved business_inquiry_private.inquiries; cfg business_inquiry_private.configuration; fp text; new_id uuid; normalized_selections jsonb;
begin
  if p_owner_hash is null or p_attempt_hash is null or p_owner_hash !~ '^[a-f0-9]{64}$' or p_attempt_hash !~ '^[a-f0-9]{64}$'
    or p_payload is null or not business_inquiry_private.valid_payload(p_payload)
    or ((p_actor_id is null) <> (p_organization_id is null)) then raise exception 'business_inquiry_invalid_request'; end if;
  -- Canonicalize the contract's numeric fields so JSONB-equal 10 and 10.0 hash equally.
  p_payload := jsonb_set(p_payload, '{siteCount}', to_jsonb((p_payload->>'siteCount')::numeric::integer));
  select coalesce(jsonb_agg(jsonb_set(value, '{quantity}', to_jsonb(trim_scale((value->>'quantity')::numeric))) order by ord), '[]'::jsonb)
    into normalized_selections from jsonb_array_elements(p_payload->'selections') with ordinality as selections(value, ord);
  p_payload := jsonb_set(p_payload, '{selections}', normalized_selections);
  fp := encode(sha256(convert_to(jsonb_build_object('payload', p_payload, 'actor', p_actor_id, 'organization', p_organization_id)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_owner_hash || p_attempt_hash, 0));
  select * into saved from business_inquiry_private.inquiries where owner_hash = p_owner_hash and attempt_hash = p_attempt_hash;
  -- Replay does not depend on later feature/policy switches and cannot create another event.
  if found then
    if saved.fingerprint <> fp then raise exception 'business_inquiry_conflict'; end if;
    if p_actor_id is not null and not business_inquiry_private.organization_allowed(p_actor_id, p_organization_id) then
      raise exception 'business_inquiry_not_permitted'; end if;
    return business_inquiry_private.receipt(saved.id, true);
  end if;
  select * into cfg from business_inquiry_private.configuration where singleton for share;
  if not found or not cfg.enabled or not cfg.visibility_ready or not cfg.retention_ready
    or cfg.policy_version is null or cfg.policy_binding->>'scope' is distinct from 'business_b2b'
    or not exists(select 1 from public.care_role_assignments r where business_inquiry_private.staff_allowed(r.user_id))
    then raise exception 'business_inquiry_not_ready'; end if;
  if p_actor_id is not null and not business_inquiry_private.organization_allowed(p_actor_id, p_organization_id) then
    raise exception 'business_inquiry_not_permitted'; end if;
  insert into business_inquiry_private.inquiries(owner_hash, attempt_hash, fingerprint, payload, submitted_by,
    organization_id, policy_version, policy_binding)
    values(p_owner_hash, p_attempt_hash, fp, p_payload, p_actor_id, p_organization_id, cfg.policy_version, cfg.policy_binding) returning id into new_id;
  insert into business_inquiry_private.workflow(inquiry_id) values(new_id);
  insert into business_inquiry_private.events(inquiry_id, action, actor_id, revision) values(new_id, 'received', p_actor_id, 1);
  insert into business_inquiry_private.notice_intents(inquiry_id, event_key, policy_version)
    values(new_id, 'business-inquiry-received:' || new_id::text, cfg.policy_version);
  return business_inquiry_private.receipt(new_id, false);
end;
$$;

create or replace function public.research_business_inquiry_read(p_actor_id uuid, p_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not business_inquiry_private.staff_allowed(p_actor_id) then raise exception 'business_inquiry_not_permitted'; end if;
  result := business_inquiry_private.project(p_id);
  if result is null then raise exception 'business_inquiry_not_found'; end if;
  insert into business_inquiry_private.events(inquiry_id, action, actor_id, revision)
    values(p_id, 'detail_read', p_actor_id, (result->>'revision')::int);
  return result;
end;
$$;
create or replace function public.research_business_inquiry_list(p_actor_id uuid, p_before uuid default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare ids uuid[]; current_id uuid; items jsonb := '[]';
begin
  if not business_inquiry_private.staff_allowed(p_actor_id) then raise exception 'business_inquiry_not_permitted'; end if;
  select array_agg(id order by id desc) into ids from
    (select id from business_inquiry_private.inquiries where p_before is null or id < p_before order by id desc limit 51) page;
  foreach current_id in array coalesce(ids[1:50], array[]::uuid[]) loop
    items := items || jsonb_build_array(business_inquiry_private.project(current_id));
    insert into business_inquiry_private.events(inquiry_id, action, actor_id, revision)
      select current_id, 'list_read', p_actor_id, revision from business_inquiry_private.workflow where inquiry_id = current_id;
  end loop;
  return jsonb_build_object('items', items, 'nextBefore', case when cardinality(ids) > 50 then ids[50] else null end);
end;
$$;
create or replace function public.research_business_inquiry_org_list(p_actor_id uuid, p_organization_id uuid, p_before uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare ids uuid[]; current_id uuid; items jsonb := '[]';
begin
  if not business_inquiry_private.organization_allowed(p_actor_id, p_organization_id) then raise exception 'business_inquiry_not_permitted'; end if;
  select array_agg(id order by id desc) into ids from (select id from business_inquiry_private.inquiries
    where organization_id = p_organization_id and (p_before is null or id < p_before) order by id desc limit 51) page;
  foreach current_id in array coalesce(ids[1:50], array[]::uuid[]) loop
    items := items || jsonb_build_array(business_inquiry_private.project(current_id));
    insert into business_inquiry_private.events(inquiry_id, action, actor_id, revision)
      select current_id, 'organization_list_read', p_actor_id, revision from business_inquiry_private.workflow where inquiry_id = current_id;
  end loop;
  return jsonb_build_object('items', items, 'nextBefore', case when cardinality(ids) > 50 then ids[50] else null end);
end;
$$;

create or replace function public.research_business_inquiry_assign(p_actor_id uuid, p_id uuid, p_command_id uuid,
  p_expected_revision integer, p_assigned_to uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare prior business_inquiry_private.assignment_commands; current business_inquiry_private.workflow; result jsonb;
begin
  if not business_inquiry_private.staff_allowed(p_actor_id, true) then raise exception 'business_inquiry_not_permitted'; end if;
  if p_command_id is null or p_expected_revision is null or p_expected_revision < 1 then raise exception 'business_inquiry_invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text, 1));
  select * into prior from business_inquiry_private.assignment_commands where command_id = p_command_id;
  if found then
    if prior.inquiry_id <> p_id or prior.actor_id <> p_actor_id or prior.expected_revision <> p_expected_revision
      or prior.assigned_to is distinct from p_assigned_to then raise exception 'business_inquiry_conflict'; end if;
    return prior.result || jsonb_build_object('replayed', true);
  end if;
  if p_assigned_to is not null and not business_inquiry_private.staff_allowed(p_assigned_to, true) then
    raise exception 'business_inquiry_not_permitted'; end if;
  select * into current from business_inquiry_private.workflow where inquiry_id = p_id for update;
  if not found then raise exception 'business_inquiry_not_found'; end if;
  if current.revision <> p_expected_revision then raise exception 'business_inquiry_conflict'; end if;
  update business_inquiry_private.workflow set assigned_to = p_assigned_to, revision = revision + 1, updated_at = clock_timestamp()
    where inquiry_id = p_id returning * into current;
  result := jsonb_build_object('id', p_id, 'revision', current.revision, 'assignedTo', current.assigned_to, 'replayed', false);
  insert into business_inquiry_private.events(inquiry_id, action, actor_id, revision, assigned_to)
    values(p_id, 'assigned', p_actor_id, current.revision, current.assigned_to);
  insert into business_inquiry_private.assignment_commands(command_id, inquiry_id, actor_id, expected_revision, assigned_to, result)
    values(p_command_id, p_id, p_actor_id, p_expected_revision, p_assigned_to, result);
  return result;
end;
$$;

-- Function EXECUTE defaults are revoked explicitly. Invoker functions run only as the private server role.
revoke all on all functions in schema business_inquiry_private from public, anon, authenticated;
revoke all on function public.research_business_inquiry_submit(text,text,jsonb,uuid,uuid),
 public.research_business_inquiry_read(uuid,uuid), public.research_business_inquiry_list(uuid,uuid),
 public.research_business_inquiry_org_list(uuid,uuid,uuid), public.research_business_inquiry_assign(uuid,uuid,uuid,integer,uuid)
 from public, anon, authenticated;
grant usage on schema business_inquiry_private to service_role;
grant select on all tables in schema business_inquiry_private to service_role;
grant insert on business_inquiry_private.inquiries, business_inquiry_private.workflow,
 business_inquiry_private.events, business_inquiry_private.assignment_commands, business_inquiry_private.notice_intents to service_role;
grant update on business_inquiry_private.workflow to service_role;
grant usage, select on all sequences in schema business_inquiry_private to service_role;
grant execute on all functions in schema business_inquiry_private to service_role;
grant execute on function public.research_business_inquiry_submit(text,text,jsonb,uuid,uuid),
 public.research_business_inquiry_read(uuid,uuid), public.research_business_inquiry_list(uuid,uuid),
 public.research_business_inquiry_org_list(uuid,uuid,uuid), public.research_business_inquiry_assign(uuid,uuid,uuid,integer,uuid) to service_role;
-- Existing service_role identity/Care/buyer read privileges are required, not broadened here.
commit;
