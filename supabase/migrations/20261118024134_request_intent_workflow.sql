-- Additive request workflow only. No role assignment, capability approval,
-- configuration activation or provider call. Notification custody is a separate
-- reviewed adapter invoked synchronously in these same transactions.
begin;
set local lock_timeout = '5s';

create table if not exists request_intent_private.workflow_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  environment text check (environment ~ '^[a-z][a-z0-9_-]{2,63}$'),
  start_at timestamptz,
  retention_policy_version text,
  recipient_policy_version text,
  check (not enabled or (environment is not null and start_at is not null and isfinite(start_at)
    and length(retention_policy_version) between 1 and 200
    and length(recipient_policy_version) between 1 and 200
    and retention_policy_version is not null and recipient_policy_version is not null))
);
insert into request_intent_private.workflow_settings(singleton) values (true) on conflict(singleton) do nothing;

create table if not exists request_intent_private.workflow (
  request_id uuid primary key references request_intent_private.requests(id),
  environment text not null,
  state text not null check (state in ('queued','reviewing')),
  revision bigint not null check (revision in (1,2)),
  initial_queue_cycle_id uuid not null unique,
  processor_user_id uuid references auth.users(id),
  changed_at timestamptz not null,
  check ((state='queued' and revision=1 and processor_user_id is null)
    or (state='reviewing' and revision=2 and processor_user_id is not null))
);
create table if not exists request_intent_private.workflow_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references request_intent_private.workflow(request_id),
  revision bigint not null check (revision between 0 and 2),
  kind text not null check (kind in ('received','queued','review_started')),
  occurred_at timestamptz not null,
  actor_user_id uuid references auth.users(id),
  command_id uuid,
  unique(request_id,revision),
  check ((kind='received' and revision=0 and actor_user_id is null and command_id is null)
    or (kind='queued' and revision=1 and actor_user_id is null and command_id is null)
    or (kind='review_started' and revision=2 and actor_user_id is not null and command_id is not null))
);
create table if not exists request_intent_private.workflow_commands (
  command_id uuid primary key,
  request_id uuid not null references request_intent_private.workflow(request_id),
  actor_user_id uuid not null references auth.users(id),
  expected_revision bigint not null check (expected_revision=1),
  event_id uuid not null unique references request_intent_private.workflow_events(id)
);
create table if not exists request_intent_private.workflow_staff_intents (
  request_id uuid primary key references request_intent_private.workflow(request_id),
  event_id uuid not null unique references request_intent_private.workflow_events(id),
  event_key text not null unique,
  check (event_key='ea-request-submitted-' || request_id::text)
);
-- A deployment-specific operational scope, not an organization inferred from
-- contact text. Empty by default. Organization-specific partitioning is not
-- supported by the canonical request schema and must not be represented here.
create table if not exists request_intent_private.workflow_processor_scopes (
  actor_user_id uuid not null references auth.users(id),
  environment text not null check (environment ~ '^[a-z][a-z0-9_-]{2,63}$'),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null,
  revoked_at timestamptz,
  primary key(actor_user_id,environment),
  check(revoked_at is null or revoked_at>=approved_at)
);

-- Preserve all installed role/permission checks and separately approved values.
-- Extend only single-column allow checks; never replace an installed role list.
do $migration$
declare item record; prior record; column_number smallint; checked integer;
begin
  for item in select * from (values
    ('care_role_assignments','role','request_intent_processor'),
    ('care_access_audit','permission','request_intent:process')
  ) as additions(table_name,column_name,added_value) loop
    select attnum into strict column_number from pg_catalog.pg_attribute
      where attrelid=format('public.%I',item.table_name)::regclass and attname=item.column_name and not attisdropped;
    checked:=0;
    for prior in select conname,pg_catalog.pg_get_expr(conbin,conrelid) as expression
      from pg_catalog.pg_constraint
      where conrelid=format('public.%I',item.table_name)::regclass and contype='c'
        and convalidated and conkey=array[column_number] loop
      checked:=checked+1;
      if position(quote_literal(item.added_value) in prior.expression)=0 then
        execute format('alter table public.%I drop constraint %I, add constraint %I check ((%s) or %I=%L)',
          item.table_name,prior.conname,prior.conname,prior.expression,item.column_name,item.added_value);
      end if;
    end loop;
    if checked=0 then raise exception 'request_workflow_role_contract_missing'; end if;
  end loop;
end;
$migration$;
insert into public.care_capabilities(capability_key,state)
  values ('request_intent_process','disabled') on conflict (capability_key) do nothing;

create or replace function request_intent_private.workflow_backend()
returns void language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception using errcode='42501',message='request_workflow_backend_only';
  end if;
end;
$$;

create or replace function request_intent_private.workflow_scope(p_environment text,p_start_at timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare config request_intent_private.workflow_settings;
begin
  perform request_intent_private.workflow_backend();
  select * into config from request_intent_private.workflow_settings where singleton for share;
  if config.enabled is distinct from true or p_environment is null or p_start_at is null
    or p_environment is distinct from config.environment or p_start_at is distinct from config.start_at then
    raise exception using errcode='55000',message='request_workflow_unavailable';
  end if;
end;
$$;

create or replace function request_intent_private.workflow_setting_pin()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.environment is not null and (new.environment is distinct from old.environment or new.start_at is distinct from old.start_at) then
    raise exception using errcode='22023',message='request_workflow_cutoff_pinned';
  end if;
  return new;
end;
$$;
drop trigger if exists workflow_setting_pin on request_intent_private.workflow_settings;
create trigger workflow_setting_pin before update on request_intent_private.workflow_settings
  for each row execute function request_intent_private.workflow_setting_pin();

create or replace function request_intent_private.workflow_projection(p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare stored request_intent_private.workflow; reference text; history jsonb; notice text;
begin
  select * into stored from request_intent_private.workflow where request_id=p_request_id;
  if not found then return null; end if;
  select public_reference into strict reference from request_intent_private.requests where id=p_request_id;
  select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'kind',kind,
    'occurredAt',to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by revision)
    into history from request_intent_private.workflow_events where request_id=p_request_id;
  -- The separately owned delivery adapter is mandatory only after activation.
  -- It returns a minimal transport fact, never an email/contact/provider error.
  select request_intent_private.workflow_customer_notice(p_request_id,id) into notice
    from request_intent_private.workflow_events where request_id=p_request_id and revision=stored.revision;
  if notice is null or notice not in ('pending','provider_accepted','delivered_to_server','delivery_unknown','failed','suppressed','unavailable') then
    raise exception using errcode='55000',message='request_workflow_delivery_contract_invalid';
  end if;
  return jsonb_build_object('schemaVersion',1,'requestId',stored.request_id,'publicReference',reference,
    'state',stored.state,'revision',stored.revision,
    'changedAt',to_char(stored.changed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'customerNotice',notice,'events',history);
end;
$$;

create or replace function request_intent_private.workflow_initialize()
returns trigger language plpgsql security definer set search_path='' as $$
declare config request_intent_private.workflow_settings; received_id uuid:=gen_random_uuid(); queued_id uuid:=gen_random_uuid();
begin
  select * into config from request_intent_private.workflow_settings where singleton for share;
  if config.enabled is distinct from true or new.created_at<config.start_at then return new; end if;
  perform request_intent_private.workflow_backend();
  if new.status is distinct from 'pending_review' then raise exception 'request_workflow_queue_ineligible'; end if;
  insert into request_intent_private.workflow(request_id,environment,state,revision,initial_queue_cycle_id,changed_at)
    values(new.id,config.environment,'queued',1,gen_random_uuid(),new.created_at);
  insert into request_intent_private.workflow_events(id,request_id,revision,kind,occurred_at) values
    (received_id,new.id,0,'received',new.created_at),(queued_id,new.id,1,'queued',new.created_at);
  insert into request_intent_private.workflow_staff_intents(request_id,event_id,event_key)
    values(new.id,queued_id,'ea-request-submitted-' || new.id::text);
  perform request_intent_private.enqueue_workflow_notice(new.id,queued_id,'request_received_queued',1::bigint,config.environment);
  return new;
end;
$$;
-- Winning INSERT only: ON CONFLICT replay never fires this initializer.
drop trigger if exists request_workflow_initialize on request_intent_private.requests;
create trigger request_workflow_initialize after insert on request_intent_private.requests
  for each row execute function request_intent_private.workflow_initialize();

create or replace function request_intent_private.workflow_owner_get(p_request_id uuid,p_owner_hash text,p_environment text,p_start_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform request_intent_private.workflow_scope(p_environment,p_start_at);
  if auth.uid() is not null then raise exception using errcode='42501',message='request_workflow_backend_only'; end if;
  if p_owner_hash is null or p_owner_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='request_workflow_invalid_owner';
  end if;
  if not exists(select 1 from request_intent_private.requests r join request_intent_private.workflow w on w.request_id=r.id
    where r.id=p_request_id and r.owner_hash=p_owner_hash and w.environment=p_environment) then return null; end if;
  return request_intent_private.workflow_projection(p_request_id);
end;
$$;

create or replace function request_intent_private.workflow_staff_get(p_request_id uuid,p_actor_user_id uuid,p_environment text,p_start_at timestamptz,
  p_mfa_verified boolean,p_processing_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform request_intent_private.workflow_scope(p_environment,p_start_at);
  perform request_intent_private.require_queue_reader(p_actor_user_id);
  if not exists(select 1 from request_intent_private.workflow where request_id=p_request_id and environment=p_environment) then return null; end if;
  insert into request_intent_private.access_events(request_id,event_type,actor_user_id) values(p_request_id,'staff_read',p_actor_user_id);
  return jsonb_build_object('workflow',request_intent_private.workflow_projection(p_request_id),
    'canStartReview',p_processing_enabled is true and p_mfa_verified is true
      and exists(select 1 from request_intent_private.workflow where request_id=p_request_id and state='queued')
      and exists(select 1 from public.care_role_assignments where user_id=p_actor_user_id
        and role='request_intent_processor' and revoked_at is null)
      and exists(select 1 from public.care_capabilities where capability_key='request_intent_process'
        and state='enabled' and approved_by is not null and approved_at is not null)
      and exists(select 1 from request_intent_private.workflow_processor_scopes where actor_user_id=p_actor_user_id
        and environment=p_environment and revoked_at is null));
end;
$$;

create or replace function request_intent_private.workflow_require_processor(p_actor_user_id uuid,p_mfa_verified boolean,p_environment text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform request_intent_private.workflow_backend();
  if p_mfa_verified is distinct from true or p_actor_user_id is null
    or (auth.uid() is not null and auth.uid() is distinct from p_actor_user_id) then
    raise exception using errcode='42501',message='request_intent_processing_required';
  end if;
  perform 1 from public.care_role_assignments where user_id=p_actor_user_id and role='request_intent_processor'
    and revoked_at is null for share;
  if not found then raise exception using errcode='42501',message='request_intent_processing_required'; end if;
  perform 1 from request_intent_private.workflow_processor_scopes where actor_user_id=p_actor_user_id
    and environment=p_environment and revoked_at is null for share;
  if not found then raise exception using errcode='42501',message='request_intent_processing_required'; end if;
  perform 1 from public.care_capabilities where capability_key='request_intent_process' and state='enabled'
    and approved_by is not null and approved_at is not null for share;
  if not found then raise exception using errcode='42501',message='request_intent_processing_required'; end if;
end;
$$;

create or replace function request_intent_private.start_review(p_request_id uuid,p_actor_user_id uuid,p_mfa_verified boolean,
  p_expected_revision bigint,p_command_id uuid,p_environment text,p_start_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stored request_intent_private.workflow; prior request_intent_private.workflow_commands;
  event_id uuid:=gen_random_uuid(); happened_at timestamptz;
begin
  perform request_intent_private.workflow_scope(p_environment,p_start_at);
  perform request_intent_private.workflow_require_processor(p_actor_user_id,p_mfa_verified,p_environment);
  if p_command_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<1 or p_expected_revision>9007199254740991 then
    raise exception using errcode='22023',message='request_workflow_invalid_command';
  end if;
  select * into stored from request_intent_private.workflow where request_id=p_request_id and environment=p_environment for update;
  if not found then return null; end if;
  select * into prior from request_intent_private.workflow_commands where command_id=p_command_id;
  if found then
    if prior.request_id is distinct from p_request_id or prior.actor_user_id is distinct from p_actor_user_id
      or prior.expected_revision is distinct from p_expected_revision then
      raise exception using errcode='23505',message='request_workflow_command_conflict';
    end if;
    return jsonb_build_object('replay',true,'workflow',request_intent_private.workflow_projection(p_request_id));
  end if;
  if stored.state<>'queued' or stored.revision<>p_expected_revision then
    raise exception using errcode='40001',message='request_workflow_revision_conflict';
  end if;
  happened_at:=greatest(clock_timestamp(),stored.changed_at);
  update request_intent_private.workflow set state='reviewing',revision=2,processor_user_id=p_actor_user_id,changed_at=happened_at
    where request_id=p_request_id and state='queued' and revision=p_expected_revision;
  if not found then raise exception using errcode='40001',message='request_workflow_revision_conflict'; end if;
  insert into request_intent_private.workflow_events(id,request_id,revision,kind,occurred_at,actor_user_id,command_id)
    values(event_id,p_request_id,2,'review_started',happened_at,p_actor_user_id,p_command_id);
  insert into request_intent_private.workflow_commands(command_id,request_id,actor_user_id,expected_revision,event_id)
    values(p_command_id,p_request_id,p_actor_user_id,p_expected_revision,event_id);
  perform request_intent_private.enqueue_workflow_notice(p_request_id,event_id,'request_reviewing',2::bigint,p_environment);
  return jsonb_build_object('replay',false,'workflow',request_intent_private.workflow_projection(p_request_id));
end;
$$;

create or replace function public.request_intent_workflow_owner_get(p_request_id uuid,p_owner_hash text,p_environment text,p_start_at timestamptz)
returns jsonb language sql security invoker set search_path='' as $$
  select request_intent_private.workflow_owner_get(p_request_id,p_owner_hash,p_environment,p_start_at);
$$;
create or replace function public.request_intent_workflow_staff_get(p_request_id uuid,p_actor_user_id uuid,p_environment text,p_start_at timestamptz,
  p_mfa_verified boolean,p_processing_enabled boolean)
returns jsonb language sql security invoker set search_path='' as $$
  select request_intent_private.workflow_staff_get(p_request_id,p_actor_user_id,p_environment,p_start_at,p_mfa_verified,p_processing_enabled);
$$;
create or replace function public.request_intent_start_review(p_request_id uuid,p_actor_user_id uuid,p_mfa_verified boolean,
  p_expected_revision bigint,p_command_id uuid,p_environment text,p_start_at timestamptz)
returns jsonb language sql security invoker set search_path='' as $$
  select request_intent_private.start_review(p_request_id,p_actor_user_id,p_mfa_verified,p_expected_revision,p_command_id,p_environment,p_start_at);
$$;

-- No table access, including service_role. All state changes pass checked RPCs.
do $security$
declare table_name text; fn record;
begin
  foreach table_name in array array['workflow_settings','workflow','workflow_events','workflow_commands','workflow_staff_intents','workflow_processor_scopes'] loop
    execute format('alter table request_intent_private.%I enable row level security',table_name);
    execute format('alter table request_intent_private.%I force row level security',table_name);
    execute format('revoke all on table request_intent_private.%I from public,anon,authenticated,service_role',table_name);
  end loop;
  for fn in select p.oid::regprocedure as signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='request_intent_private' and p.proname in ('workflow_backend','workflow_scope','workflow_setting_pin','workflow_projection',
      'workflow_initialize','workflow_owner_get','workflow_staff_get','workflow_require_processor','start_review') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
  end loop;
end;
$security$;
revoke all on function public.request_intent_workflow_owner_get(uuid,text,text,timestamptz),
  public.request_intent_workflow_staff_get(uuid,uuid,text,timestamptz,boolean,boolean),
  public.request_intent_start_review(uuid,uuid,boolean,bigint,uuid,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.request_intent_workflow_owner_get(uuid,text,text,timestamptz),
  public.request_intent_workflow_staff_get(uuid,uuid,text,timestamptz,boolean,boolean),
  public.request_intent_start_review(uuid,uuid,boolean,bigint,uuid,text,timestamptz),
  request_intent_private.workflow_owner_get(uuid,text,text,timestamptz),
  request_intent_private.workflow_staff_get(uuid,uuid,text,timestamptz,boolean,boolean),
  request_intent_private.start_review(uuid,uuid,boolean,bigint,uuid,text,timestamptz) to service_role;

drop trigger if exists workflow_events_no_mutation on request_intent_private.workflow_events;
create trigger workflow_events_no_mutation before update or delete on request_intent_private.workflow_events
  for each row execute function request_intent_private.deny_mutation();
drop trigger if exists workflow_commands_no_mutation on request_intent_private.workflow_commands;
create trigger workflow_commands_no_mutation before update or delete on request_intent_private.workflow_commands
  for each row execute function request_intent_private.deny_mutation();
drop trigger if exists workflow_staff_intents_no_mutation on request_intent_private.workflow_staff_intents;
create trigger workflow_staff_intents_no_mutation before update or delete on request_intent_private.workflow_staff_intents
  for each row execute function request_intent_private.deny_mutation();
commit;
