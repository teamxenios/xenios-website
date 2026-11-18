-- SOURCE CANDIDATE ONLY. No scheduler, activation, lifecycle backfill or guard
-- replacement. Requires the canonical request store, workflow and policy capture.
-- The two fixed Root seams described in the handoff MUST be independently bound
-- before this transaction can erase anything. Never install fixture seams.
begin;
set local lock_timeout='5s';

create table if not exists request_intent_private.retention_execution_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  environment text,
  activated_at timestamptz,
  authority_definition_sha256 text check(authority_definition_sha256 ~ '^[0-9a-f]{64}$'),
  prepare_definition_sha256 text check(prepare_definition_sha256 ~ '^[0-9a-f]{64}$'),
  guard_definition_sha256 text check(guard_definition_sha256 ~ '^[0-9a-f]{64}$'),
  check(not enabled or (environment is not null and environment ~ '^[a-z][a-z0-9_-]{2,63}$'
    and activated_at is not null and isfinite(activated_at)
    and authority_definition_sha256 is not null and prepare_definition_sha256 is not null
    and guard_definition_sha256 is not null))
);
insert into request_intent_private.retention_execution_settings(singleton) values(true) on conflict do nothing;

-- This is a transaction-scoped capability, not a retention log or GUC. Successful
-- executions remove it; every exception rolls its insertion back. Direct access
-- and EXECUTE are revoked, including from the backend API role.
create table if not exists request_intent_private.retention_execution_tickets (
  request_id uuid primary key,
  execution_id uuid not null unique,
  transaction_id bigint not null,
  backend_pid integer not null,
  phase text not null check(phase='erase')
);
alter table request_intent_private.retention_execution_settings enable row level security;
alter table request_intent_private.retention_execution_settings force row level security;
alter table request_intent_private.retention_execution_tickets enable row level security;
alter table request_intent_private.retention_execution_tickets force row level security;
revoke all on table request_intent_private.retention_execution_settings,
  request_intent_private.retention_execution_tickets from public,anon,authenticated,service_role;

-- Proposed narrow Root guard hook. The existing immutable guard is NOT changed
-- here. Root may allow DELETE (never UPDATE/TRUNCATE) on exactly these three
-- tables, only after this helper succeeds for the OLD request identity.
create or replace function request_intent_private.retention_delete_authorized(p_table regclass,p_request_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select p_table in ('request_intent_private.requests'::regclass,
    'request_intent_private.access_events'::regclass,'request_intent_private.request_policy_snapshots'::regclass)
    and exists(select 1 from request_intent_private.retention_execution_tickets t
      where t.request_id=p_request_id and t.transaction_id=txid_current()
        and t.backend_pid=pg_backend_pid() and t.phase='erase');
$$;

create or replace function request_intent_private.retention_definition_sha256(p_function regprocedure)
returns text language sql stable security invoker set search_path='' as $$
  select encode(sha256(convert_to(pg_get_functiondef(p_function),'UTF8')),'hex');
$$;

create or replace function public.request_intent_retention_execute(p_request_id uuid,p_execution_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare config request_intent_private.retention_execution_settings;
  stored request_intent_private.requests; snapshot request_intent_private.request_policy_snapshots;
  bundle request_intent_private.policy_bundles; publication request_intent_private.policy_capture_publications;
  authority jsonb; prepared jsonb; observed timestamptz; closed_at timestamptz; deadline timestamptz;
  authority_proc regprocedure; prepare_proc regprocedure; guard_proc regprocedure;
  removed_access bigint; removed_snapshot bigint; removed_request bigint;
begin
  perform request_intent_private.workflow_backend();
  if auth.uid() is not null then raise exception using errcode='42501',message='retention_backend_only'; end if;
  if p_request_id is null or p_execution_id is null then
    raise exception using errcode='22023',message='retention_identity_required';
  end if;
  -- Read Committed is the qualified contract. No automatic retries, stale
  -- Repeatable Read authority, or swallowing serialization/SQL failures.
  if current_setting('transaction_isolation') is distinct from 'read committed' then
    raise exception using errcode='25000',message='retention_read_committed_required';
  end if;
  select * into config from request_intent_private.retention_execution_settings where singleton for share;
  if not found or config.enabled is distinct from true then
    return jsonb_build_object('status','blocked','reason','disabled');
  end if;
  if config.activated_at>clock_timestamp() then return jsonb_build_object('status','blocked','reason','not_active'); end if;

  authority_proc:=to_regprocedure('request_intent_private.retention_authority_lock_v1(uuid)');
  prepare_proc:=to_regprocedure('request_intent_private.retention_prepare_erasure_v1(uuid,uuid)');
  guard_proc:=to_regprocedure('request_intent_private.deny_mutation()');
  if authority_proc is null or prepare_proc is null or guard_proc is null then
    return jsonb_build_object('status','blocked','reason','root_binding_missing');
  end if;
  if request_intent_private.retention_definition_sha256(authority_proc) is distinct from config.authority_definition_sha256
    or request_intent_private.retention_definition_sha256(prepare_proc) is distinct from config.prepare_definition_sha256
    or request_intent_private.retention_definition_sha256(guard_proc) is distinct from config.guard_definition_sha256 then
    return jsonb_build_object('status','blocked','reason','root_binding_changed');
  end if;
  -- Guard identity also has to remain attached and enabled on all erased tables.
  if (select count(*) from pg_catalog.pg_trigger where not tgisinternal and tgenabled='O'
      and tgfoid=guard_proc::oid and (tgtype::int & 11)=11 and tgrelid in
        ('request_intent_private.requests'::regclass,'request_intent_private.access_events'::regclass,
         'request_intent_private.request_policy_snapshots'::regclass))<>3 then
    return jsonb_build_object('status','blocked','reason','immutable_guard_binding_missing');
  end if;

  -- Fixed reviewed authority, not caller-provided lifecycle facts. It MUST take
  -- the canonical writer locks before returning, in the order documented below.
  execute 'select request_intent_private.retention_authority_lock_v1($1)' into authority using p_request_id;
  if jsonb_typeof(authority) is distinct from 'object'
    or (select array_agg(k order by k) from jsonb_object_keys(authority) k) is distinct from
      array['classification','clinical','closedAt','conversionKnown','converted','dependenciesKnown',
        'dependencyContract','extension','financial','hold','lifecycle','requestId','schemaVersion','writersLocked']::text[]
    or authority->'schemaVersion' is distinct from '1'::jsonb
    or authority->>'requestId' is distinct from p_request_id::text
    or authority->>'classification' is distinct from 'unconverted'
    or authority->'conversionKnown' is distinct from 'true'::jsonb or authority->'converted' is distinct from 'false'::jsonb
    or authority->'clinical' is distinct from 'false'::jsonb or authority->'financial' is distinct from 'false'::jsonb
    or authority->>'hold' is distinct from 'none' or authority->>'extension' is distinct from 'none'
    or authority->'dependenciesKnown' is distinct from 'true'::jsonb or authority->'writersLocked' is distinct from 'true'::jsonb
    or authority->>'dependencyContract' is distinct from 'unconverted-no-dependent-records-v1' then
    return jsonb_build_object('status','blocked','reason','authority_ineligible');
  end if;
  if not ((authority->>'lifecycle'='open' and authority->'closedAt'='null'::jsonb)
    or (authority->>'lifecycle'='closed' and jsonb_typeof(authority->'closedAt')='string'
      and authority->>'closedAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$')) then
    return jsonb_build_object('status','blocked','reason','lifecycle_unknown');
  end if;
  closed_at:=(authority->>'closedAt')::timestamptz;
  select * into stored from request_intent_private.requests where id=p_request_id for update;
  if not found then return jsonb_build_object('status','blocked','reason','request_missing'); end if;
  observed:=clock_timestamp();
  if not isfinite(stored.created_at) or stored.created_at>observed
    or (closed_at is not null and (not isfinite(closed_at) or closed_at<stored.created_at or closed_at>observed)) then
    return jsonb_build_object('status','blocked','reason','timeline_invalid');
  end if;
  -- The source rows independently deny clinical lines, even if a bad authority
  -- incorrectly calls them ordinary. There is no conversion from queue state.
  if exists(select 1 from jsonb_array_elements(stored.lines) l
    where l->'clinicalReviewRequired' is distinct from 'false'::jsonb
      or l->>'family'='clinical_formulations_503a') then
    return jsonb_build_object('status','blocked','reason','clinical_or_unknown_line');
  end if;
  select * into snapshot from request_intent_private.request_policy_snapshots where request_id=stored.id for share;
  if not found then return jsonb_build_object('status','blocked','reason','policy_snapshot_missing'); end if;
  select * into bundle from request_intent_private.policy_bundles where id=snapshot.bundle_id for share;
  select * into publication from request_intent_private.policy_capture_publications where id=snapshot.publication_id for share;
  if bundle.retention_policy_id is distinct from 'EA-DURABLE-RETENTION-1.0'
    or bundle.retention_policy_version is distinct from '1.0'
    or bundle.retention_record_reference is distinct from 'KAN-149/13456'
    or bundle.retention_document_sha256 is distinct from '3ee9afedecfb03dfa01cc9d0bdfe046e26b554bae61cc3b31d7dcfa91a1cc52b'
    or bundle.approval_record_reference is distinct from 'KAN-149/13461'
    or bundle.environment is distinct from config.environment or publication.environment is distinct from config.environment
    or publication.bundle_id is distinct from bundle.id or publication.effective_at>stored.created_at
    or bundle.approval_received_at>stored.created_at or bundle.created_at>stored.created_at
    or snapshot.captured_at<stored.created_at or snapshot.captured_at>observed then
    return jsonb_build_object('status','blocked','reason','policy_snapshot_ineligible');
  end if;
  deadline:=stored.created_at+interval '4320 hours'; -- 180 elapsed UTC days
  if closed_at is not null then deadline:=least(deadline,closed_at+interval '2160 hours'); end if; -- 90 elapsed days
  if observed<deadline then return jsonb_build_object('status','blocked','reason','not_due'); end if;

  -- First supported class has no workflow/notice/quote/support/order/mail graph.
  -- The authority must map non-FK stores as well. Additional FKs fail closed even
  -- when their table is empty: a new graph requires a new reviewed implementation.
  if exists(select 1 from pg_catalog.pg_constraint where contype='f' and confrelid='request_intent_private.requests'::regclass
      and conrelid not in ('request_intent_private.access_events'::regclass,
        'request_intent_private.request_policy_snapshots'::regclass,'request_intent_private.workflow'::regclass,
        'request_intent_private.workflow_notice_intents'::regclass))
    or exists(select 1 from request_intent_private.workflow where request_id=stored.id)
    or exists(select 1 from request_intent_private.workflow_notice_intents where request_id=stored.id)
    or (select count(*) from request_intent_private.access_events where request_id=stored.id)>1000 then
    return jsonb_build_object('status','blocked','reason','dependency_graph_unsupported');
  end if;
  -- Root prepare MUST preserve due minimal evidence under its actual schedule,
  -- preserve authentic policy provenance, and install durable replay suppression
  -- respected by canonical create/find BEFORE returning this exact receipt.
  execute 'select request_intent_private.retention_prepare_erasure_v1($1,$2)' into prepared using stored.id,p_execution_id;
  if jsonb_typeof(prepared) is distinct from 'object'
    or (select array_agg(k order by k) from jsonb_object_keys(prepared) k) is distinct from
      array['accessEvidencePreserved','executionId','policyProvenancePreserved','replaySuppressed','requestId','schemaVersion']::text[]
    or prepared->'schemaVersion' is distinct from '1'::jsonb or prepared->>'requestId' is distinct from stored.id::text
    or prepared->>'executionId' is distinct from p_execution_id::text
    or prepared->'accessEvidencePreserved' is distinct from 'true'::jsonb
    or prepared->'policyProvenancePreserved' is distinct from 'true'::jsonb
    or prepared->'replaySuppressed' is distinct from 'true'::jsonb then
    raise exception using errcode='55000',message='retention_preparation_incomplete';
  end if;
  insert into request_intent_private.retention_execution_tickets values(stored.id,p_execution_id,txid_current(),pg_backend_pid(),'erase');
  delete from request_intent_private.access_events where request_id=stored.id;
  get diagnostics removed_access=row_count;
  delete from request_intent_private.request_policy_snapshots where request_id=stored.id;
  get diagnostics removed_snapshot=row_count;
  delete from request_intent_private.requests where id=stored.id;
  get diagnostics removed_request=row_count;
  if removed_snapshot<>1 or removed_request<>1 then raise exception using errcode='55000',message='retention_erase_incomplete'; end if;
  delete from request_intent_private.retention_execution_tickets where request_id=stored.id;
  return jsonb_build_object('status','erased','requestId',stored.id,'executionId',p_execution_id,
    'erasedAt',observed,'deadlineAt',deadline,'removedAccessEvents',removed_access,
    'removedPolicySnapshots',removed_snapshot,'removedRequests',removed_request);
end;
$$;
revoke all on function request_intent_private.retention_delete_authorized(regclass,uuid),
  request_intent_private.retention_definition_sha256(regprocedure),
  public.request_intent_retention_execute(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.request_intent_retention_execute(uuid,uuid) to service_role;
commit;
