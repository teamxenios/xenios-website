-- SOURCE-ONLY prerequisite, not a registered/applied migration or activation.
-- Requires the canonical request store and workflow87. No policy records,
-- approval values, settings, cutoffs, roles, legacy captures or mail are seeded.
begin;
set local lock_timeout = '5s';

create or replace function request_intent_private.valid_policy_agreement_pairs(value jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare entry jsonb;
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) not between 1 and 32 then return false; end if;
  for entry in select jsonb_array_elements(value) loop
    if not request_intent_private.only_keys(entry,array['kind','version'])
      or jsonb_typeof(entry->'kind') is distinct from 'string'
      or jsonb_typeof(entry->'version') is distinct from 'string'
      or (entry->>'kind') !~ '^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,79}$'
      or (entry->>'version') !~ '^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,79}$'
      or left(entry->>'kind',length('assisted_order_form_v1:'))='assisted_order_form_v1:' then return false; end if;
  end loop;
  return not exists (select 1 from jsonb_array_elements(value) e group by e->>'kind' having count(*)>1);
exception when others then return false;
end;
$$;

-- Approved records are supplied only later by the authorized database custodian.
-- Structural references/hashes do not themselves authenticate an approval.
create table if not exists request_intent_private.policy_bundles (
  id uuid primary key,
  environment text not null check (environment ~ '^[a-z][a-z0-9_-]{2,63}$'),
  retention_policy_id text not null check (retention_policy_id ~ '^[A-Z0-9][A-Z0-9_.-]{0,99}$'),
  retention_policy_version text not null check (retention_policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  retention_record_reference text not null check (retention_record_reference ~ '^[A-Za-z0-9][A-Za-z0-9.:/@_-]{0,199}$'),
  retention_document_sha256 text not null check (retention_document_sha256 ~ '^[a-f0-9]{64}$'),
  recipient_policy_id text not null check (recipient_policy_id ~ '^[A-Z0-9][A-Z0-9_.-]{0,99}$'),
  recipient_policy_version text not null check (recipient_policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  recipient_record_reference text not null check (recipient_record_reference ~ '^[A-Za-z0-9][A-Za-z0-9.:/@_-]{0,199}$'),
  recipient_document_sha256 text not null check (recipient_document_sha256 ~ '^[a-f0-9]{64}$'),
  approval_record_reference text not null check (approval_record_reference ~ '^[A-Za-z0-9][A-Za-z0-9.:/@_-]{0,199}$'),
  approval_received_at timestamptz not null check (isfinite(approval_received_at)),
  required_agreements jsonb not null check (request_intent_private.valid_policy_agreement_pairs(required_agreements)),
  notice_agreement_kind text not null,
  notice_agreement_version text not null,
  notice_document_sha256 text not null check (notice_document_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp() check (isfinite(created_at)),
  check (retention_policy_id<>recipient_policy_id and retention_record_reference<>recipient_record_reference),
  check (approval_received_at<=created_at),
  -- Notice revision is a real existing accepted legal pair, not a new browser
  -- policy selector or invented acceptance of the internal business policy.
  check (required_agreements @> jsonb_build_array(jsonb_build_object(
    'kind',notice_agreement_kind,'version',notice_agreement_version)))
);
create table if not exists request_intent_private.request_policy_snapshots (
  request_id uuid primary key references request_intent_private.requests(id),
  bundle_id uuid not null references request_intent_private.policy_bundles(id),
  captured_at timestamptz not null default clock_timestamp() check (isfinite(captured_at))
);
alter table request_intent_private.policy_bundles enable row level security;
alter table request_intent_private.policy_bundles force row level security;
alter table request_intent_private.request_policy_snapshots enable row level security;
alter table request_intent_private.request_policy_snapshots force row level security;
revoke all on table request_intent_private.policy_bundles,
  request_intent_private.request_policy_snapshots from public,anon,authenticated,service_role;

-- Reuse workflow87's already pinned environment/start_at as the one prospective
-- boundary. Capture can be enabled independently of queued/reviewing or mail.
alter table request_intent_private.workflow_settings
  add column if not exists policy_capture_enabled boolean not null default false,
  add column if not exists policy_capture_bundle_id uuid references request_intent_private.policy_bundles(id);
do $$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='request_intent_private.workflow_settings'::regclass
    and conname='request_policy_capture_ready') then
    alter table request_intent_private.workflow_settings add constraint request_policy_capture_ready
      check (not policy_capture_enabled or (policy_capture_bundle_id is not null
        and environment is not null and start_at is not null and isfinite(start_at)));
  end if;
end; $$;

create or replace function request_intent_private.policy_capture_setting_pin()
returns trigger language plpgsql set search_path='' as $$
declare bundle request_intent_private.policy_bundles;
begin
  if old.policy_capture_bundle_id is not null and (
    new.policy_capture_bundle_id is distinct from old.policy_capture_bundle_id
    or new.environment is distinct from old.environment or new.start_at is distinct from old.start_at
    or new.retention_policy_version is distinct from old.retention_policy_version
    or new.recipient_policy_version is distinct from old.recipient_policy_version) then
    raise exception using errcode='22023',message='request_policy_capture_binding_pinned';
  end if;
  if new.policy_capture_enabled or new.policy_capture_bundle_id is not null then
    select * into bundle from request_intent_private.policy_bundles where id=new.policy_capture_bundle_id for share;
    if not found or new.environment is distinct from bundle.environment
      or new.start_at is null or not isfinite(new.start_at) or new.start_at<bundle.created_at
      or new.retention_policy_version is distinct from bundle.retention_record_reference
      or new.recipient_policy_version is distinct from bundle.recipient_record_reference then
      raise exception using errcode='55000',message='request_policy_capture_configuration_invalid';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists request_policy_capture_setting_pin on request_intent_private.workflow_settings;
create trigger request_policy_capture_setting_pin before update on request_intent_private.workflow_settings
  for each row execute function request_intent_private.policy_capture_setting_pin();

-- Private helper: no application role can call it or choose a bundle. The
-- existing definer initializer owns the table access, in the winning INSERT.
create or replace function request_intent_private.capture_request_policy(p_request_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare config request_intent_private.workflow_settings; bundle request_intent_private.policy_bundles;
  stored request_intent_private.requests; actual jsonb; expected jsonb; captured timestamptz;
begin
  perform request_intent_private.workflow_backend();
  select * into config from request_intent_private.workflow_settings where singleton for share;
  if not found then raise exception using errcode='55000',message='request_policy_capture_settings_missing'; end if;
  if config.policy_capture_enabled is distinct from true then return; end if;
  select * into stored from request_intent_private.requests where id=p_request_id;
  if not found then raise exception using errcode='23503',message='request_policy_capture_request_missing'; end if;
  if config.start_at is null or not isfinite(config.start_at) then
    raise exception using errcode='55000',message='request_policy_capture_configuration_invalid';
  end if;
  if stored.created_at<config.start_at then return; end if;
  select * into bundle from request_intent_private.policy_bundles where id=config.policy_capture_bundle_id for share;
  if not found or bundle.environment is distinct from config.environment
    or config.start_at<bundle.created_at
    or config.retention_policy_version is distinct from bundle.retention_record_reference
    or config.recipient_policy_version is distinct from bundle.recipient_record_reference then
    raise exception using errcode='55000',message='request_policy_capture_configuration_invalid';
  end if;
  if not exists (select 1 from jsonb_array_elements(stored.agreements) a
    where a->>'kind'=bundle.notice_agreement_kind and a->>'version'=bundle.notice_agreement_version
      and a->'accepted'='true'::jsonb) then
    raise exception using errcode='55000',message='request_policy_capture_notice_mismatch';
  end if;
  select jsonb_agg(jsonb_build_object('kind',a->>'kind','version',a->>'version') order by a->>'kind',a->>'version')
    into actual from jsonb_array_elements(stored.agreements) a
    where left(a->>'kind',length('assisted_order_form_v1:'))<>'assisted_order_form_v1:';
  select jsonb_agg(a order by a->>'kind',a->>'version') into expected from jsonb_array_elements(bundle.required_agreements) a;
  if actual is distinct from expected then
    raise exception using errcode='55000',message='request_policy_capture_agreements_mismatch';
  end if;
  captured:=clock_timestamp();
  if captured<stored.created_at then raise exception using errcode='55000',message='request_policy_capture_clock_invalid'; end if;
  insert into request_intent_private.request_policy_snapshots(request_id,bundle_id,captured_at)
    values(stored.id,bundle.id,captured);
end;
$$;

-- Preserve workflow87 verbatim except the first helper call. No BEFORE INSERT
-- trigger and no UPDATE of immutable requests. Conflict replay never invokes it.
create or replace function request_intent_private.workflow_initialize()
returns trigger language plpgsql security definer set search_path='' as $$
declare config request_intent_private.workflow_settings; received_id uuid:=gen_random_uuid(); queued_id uuid:=gen_random_uuid();
begin
  perform request_intent_private.capture_request_policy(new.id);
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

drop trigger if exists policy_bundles_no_mutation on request_intent_private.policy_bundles;
create trigger policy_bundles_no_mutation before update or delete on request_intent_private.policy_bundles
  for each row execute function request_intent_private.deny_mutation();
drop trigger if exists policy_bundles_no_truncate on request_intent_private.policy_bundles;
create trigger policy_bundles_no_truncate before truncate on request_intent_private.policy_bundles
  for each statement execute function request_intent_private.deny_mutation();
drop trigger if exists request_policy_snapshots_no_mutation on request_intent_private.request_policy_snapshots;
create trigger request_policy_snapshots_no_mutation before update or delete on request_intent_private.request_policy_snapshots
  for each row execute function request_intent_private.deny_mutation();
drop trigger if exists request_policy_snapshots_no_truncate on request_intent_private.request_policy_snapshots;
create trigger request_policy_snapshots_no_truncate before truncate on request_intent_private.request_policy_snapshots
  for each statement execute function request_intent_private.deny_mutation();

revoke all on function request_intent_private.valid_policy_agreement_pairs(jsonb),
  request_intent_private.policy_capture_setting_pin(), request_intent_private.capture_request_policy(uuid),
  request_intent_private.workflow_initialize() from public,anon,authenticated,service_role;
-- No public projection/RPC, application table grants, config writes or cleanup.
commit;
