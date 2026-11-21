-- SOURCE CANDIDATE ONLY. No scheduler, activation, lifecycle backfill or guard
-- replacement. Requires the canonical request store, workflow and policy capture.
-- The two fixed Root seams described in the handoff MUST be independently bound
-- before this transaction can erase anything. Never install fixture seams.
begin;
set local lock_timeout='5s';
do $$ begin
  if to_regclass('request_intent_private.retention_execution_settings') is not null and not exists(
    select 1 from pg_catalog.pg_attribute where attrelid=to_regclass('request_intent_private.retention_execution_settings')
      and attname='staff_short_definition_sha256' and not attisdropped) then
    raise exception using errcode='55000',message='retention_execution_upgrade_requires_reviewed_migration';
  end if;
end $$;

create table if not exists request_intent_private.retention_execution_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  environment text,
  activated_at timestamptz,
  authority_definition_sha256 text check(authority_definition_sha256 ~ '^[0-9a-f]{64}$'),
  prepare_definition_sha256 text check(prepare_definition_sha256 ~ '^[0-9a-f]{64}$'),
  guard_definition_sha256 text check(guard_definition_sha256 ~ '^[0-9a-f]{64}$'),
  create_definition_sha256 text check(create_definition_sha256 ~ '^[0-9a-f]{64}$'),
  find_definition_sha256 text check(find_definition_sha256 ~ '^[0-9a-f]{64}$'),
  context_definition_sha256 text check(context_definition_sha256 ~ '^[0-9a-f]{64}$'),
  staff_short_definition_sha256 text check(staff_short_definition_sha256 ~ '^[0-9a-f]{64}$'),
  staff_full_definition_sha256 text check(staff_full_definition_sha256 ~ '^[0-9a-f]{64}$'),
  check(not enabled or (environment is not null and environment ~ '^[a-z][a-z0-9_-]{2,63}$'
    and activated_at is not null and isfinite(activated_at)
    and authority_definition_sha256 is not null and prepare_definition_sha256 is not null
    and guard_definition_sha256 is not null and create_definition_sha256 is not null
    and find_definition_sha256 is not null and context_definition_sha256 is not null
    and staff_short_definition_sha256 is not null and staff_full_definition_sha256 is not null))
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
  capability_nonce uuid not null,
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
        and t.backend_pid=pg_backend_pid() and t.phase='erase'
        and t.execution_id::text=current_setting('xenios.retention_execution_id',true)
        and t.capability_nonce::text=current_setting('xenios.retention_execution_nonce',true));
$$;

create or replace function request_intent_private.retention_definition_sha256(p_function regprocedure)
returns text language sql stable security invoker set search_path='' as $$
  select encode(sha256(convert_to(pg_get_functiondef(p_function),'UTF8')),'hex');
$$;

-- Independently require the two reviewed lock-bearing bodies, not whatever
-- definitions a later operator happens to bind. These SHA256 pins cover the
-- complete AS bodies in request_intent_staff_notice_retention_lock.sql; only
-- CRLF is normalized to LF. No substring, comment or operator-supplied pin can
-- satisfy this prerequisite. Keep the eight full-definition drift pins too.
create or replace function request_intent_private.retention_staff_notice_locks_valid()
returns boolean language sql stable security invoker set search_path='' as $$
  select count(*)=2 and coalesce(bool_and(coalesce(
    l.lanname='plpgsql' and p.prokind='f' and p.prosecdef and not p.proleakproof
    and not p.proisstrict and not p.proretset and p.provolatile='v' and p.proparallel='u'
    and p.prorettype='pg_catalog.int4'::regtype and p.provariadic=0 and p.prosupport=0
    and p.pronargdefaults=0 and p.pronargs=cardinality(expected.argument_names)
    and p.proargnames=expected.argument_names and p.proargmodes is null and p.proallargtypes is null
    and p.proconfig in (array['search_path=""']::text[],array['search_path=']::text[])
    and encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')=expected.body_sha256
  ,false)),false)
  from (values
    (to_regprocedure('request_intent_private.enqueue_staff_notices(timestamptz,text[])'),
      '6274ccd971a41123ef979b51ce780f1cb62bbffad19a4f295b4b401d33673192',
      array['p_since','p_recipients']::text[]),
    (to_regprocedure('request_intent_private.enqueue_staff_notices(timestamptz,text[],timestamptz)'),
      'c2b89a5ff80a7862b06b58da0e91cd2cbe757a822d8c5d243da45384e7e233e8',
      array['p_since','p_recipients','p_detail_since']::text[])
  ) as expected(function_id,body_sha256,argument_names)
  join pg_catalog.pg_proc p on p.oid=expected.function_id::oid
  join pg_catalog.pg_language l on l.oid=p.prolang;
$$;

create or replace function request_intent_private.retention_execution_bind_staff_locks()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  -- Disabling must remain possible even after definition drift.
  if new.enabled and not request_intent_private.retention_staff_notice_locks_valid() then
    raise exception using errcode='55000',message='retention_staff_notice_lock_required';
  end if;
  return new;
end;
$$;
drop trigger if exists retention_execution_bind_staff_locks on request_intent_private.retention_execution_settings;
create trigger retention_execution_bind_staff_locks before insert or update
  on request_intent_private.retention_execution_settings for each row
  execute function request_intent_private.retention_execution_bind_staff_locks();

create or replace function public.request_intent_retention_execute(p_request_id uuid,p_execution_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare config request_intent_private.retention_execution_settings;
  stored request_intent_private.requests; snapshot request_intent_private.request_policy_snapshots;
  bundle request_intent_private.policy_bundles; publication request_intent_private.policy_capture_publications;
  authority jsonb; prepared jsonb; observed timestamptz; closed_at timestamptz; deadline timestamptz;
  authority_proc regprocedure; prepare_proc regprocedure; guard_proc regprocedure;
  create_proc regprocedure; find_proc regprocedure; context_proc regprocedure;
  staff_short_proc regprocedure; staff_full_proc regprocedure;
  capability uuid:=gen_random_uuid(); prior_execution text; prior_nonce text;
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
  create_proc:=to_regprocedure('request_intent_private.create_or_replay(text,text,text,jsonb)');
  find_proc:=to_regprocedure('request_intent_private.find_attempt(text,text)');
  context_proc:=to_regprocedure('request_intent_private.create_with_context(text,text,text,jsonb,jsonb)');
  staff_short_proc:=to_regprocedure('request_intent_private.enqueue_staff_notices(timestamptz,text[])');
  staff_full_proc:=to_regprocedure('request_intent_private.enqueue_staff_notices(timestamptz,text[],timestamptz)');
  if authority_proc is null or prepare_proc is null or guard_proc is null
    or create_proc is null or find_proc is null or context_proc is null
    or staff_short_proc is null or staff_full_proc is null then
    return jsonb_build_object('status','blocked','reason','root_binding_missing');
  end if;
  if not request_intent_private.retention_staff_notice_locks_valid()
    or request_intent_private.retention_definition_sha256(authority_proc) is distinct from config.authority_definition_sha256
    or request_intent_private.retention_definition_sha256(prepare_proc) is distinct from config.prepare_definition_sha256
    or request_intent_private.retention_definition_sha256(guard_proc) is distinct from config.guard_definition_sha256
    or request_intent_private.retention_definition_sha256(create_proc) is distinct from config.create_definition_sha256
    or request_intent_private.retention_definition_sha256(find_proc) is distinct from config.find_definition_sha256
    or request_intent_private.retention_definition_sha256(context_proc) is distinct from config.context_definition_sha256
    or request_intent_private.retention_definition_sha256(staff_short_proc) is distinct from config.staff_short_definition_sha256
    or request_intent_private.retention_definition_sha256(staff_full_proc) is distinct from config.staff_full_definition_sha256 then
    return jsonb_build_object('status','blocked','reason','root_binding_changed');
  end if;
  -- Guard identity also has to remain attached and enabled on all erased tables.
  if not (select count(*)=3 and count(distinct tgrelid)=3 from pg_catalog.pg_trigger where not tgisinternal and tgenabled='O'
      and tgfoid=guard_proc::oid and (tgtype::int & 11)=11 and tgrelid in
        ('request_intent_private.requests'::regclass,'request_intent_private.access_events'::regclass,
         'request_intent_private.request_policy_snapshots'::regclass)) then
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
  if ((authority->>'lifecycle'='open' and authority->'closedAt'='null'::jsonb)
    or (authority->>'lifecycle'='closed' and jsonb_typeof(authority->'closedAt')='string'
      and authority->>'closedAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$')) is distinct from true then
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
      or l->'researchUseOnly' is distinct from 'true'::jsonb
      or l->>'family' is distinct from 'research_peptides_materials'
      or l->>'workflowMode' is distinct from 'request_pricing') then
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
    or publication.recorded_at>stored.created_at
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
  if exists(select 1 from pg_catalog.pg_constraint c where contype='f' and
      (confrelid in ('request_intent_private.access_events'::regclass,'request_intent_private.request_policy_snapshots'::regclass)
       or (confrelid='request_intent_private.requests'::regclass and
         (conrelid not in ('request_intent_private.access_events'::regclass,
           'request_intent_private.request_policy_snapshots'::regclass,'request_intent_private.workflow'::regclass,
           'request_intent_private.workflow_notice_intents'::regclass)
          or confdeltype<>'a' or confupdtype<>'a' or not convalidated
          or conkey is distinct from array[(select attnum from pg_catalog.pg_attribute
            where attrelid=c.conrelid and attname='request_id' and not attisdropped)]::smallint[]
          or confkey is distinct from array[(select attnum from pg_catalog.pg_attribute
            where attrelid=c.confrelid and attname='id' and not attisdropped)]::smallint[]))))
    or exists(select 1 from request_intent_private.workflow where request_id=stored.id)
    or exists(select 1 from request_intent_private.workflow_notice_intents where request_id=stored.id)
    or (select count(*) from request_intent_private.access_events where request_id=stored.id)>1000 then
    return jsonb_build_object('status','blocked','reason','dependency_graph_unsupported');
  end if;
  -- Known non-FK dependency from BOTH applied staff-notice migrations. This
  -- first class refuses every matching job, including terminal dispositions:
  -- no job/payload/attempt/evidence is erased or reclassified by this executor.
  perform 1 from public.research_notification_outbox
    where event_key='ea-request-submitted-'||stored.id::text for update;
  if found then return jsonb_build_object('status','blocked','reason','dependency_graph_unsupported'); end if;
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
  prior_execution:=current_setting('xenios.retention_execution_id',true);
  prior_nonce:=current_setting('xenios.retention_execution_nonce',true);
  insert into request_intent_private.retention_execution_tickets
    values(stored.id,p_execution_id,txid_current(),pg_backend_pid(),capability,'erase');
  perform set_config('xenios.retention_execution_id',p_execution_id::text,true);
  perform set_config('xenios.retention_execution_nonce',capability::text,true);
  delete from request_intent_private.access_events where request_id=stored.id;
  get diagnostics removed_access=row_count;
  delete from request_intent_private.request_policy_snapshots where request_id=stored.id;
  get diagnostics removed_snapshot=row_count;
  delete from request_intent_private.requests where id=stored.id;
  get diagnostics removed_request=row_count;
  if removed_snapshot<>1 or removed_request<>1 then raise exception using errcode='55000',message='retention_erase_incomplete'; end if;
  delete from request_intent_private.retention_execution_tickets where request_id=stored.id;
  perform set_config('xenios.retention_execution_id',coalesce(prior_execution,''),true);
  perform set_config('xenios.retention_execution_nonce',coalesce(prior_nonce,''),true);
  return jsonb_build_object('status','erased','requestId',stored.id,'executionId',p_execution_id,
    'erasedAt',observed,'deadlineAt',deadline,'removedAccessEvents',removed_access,
    'removedPolicySnapshots',removed_snapshot,'removedRequests',removed_request);
end;
$$;
revoke all on function request_intent_private.retention_delete_authorized(regclass,uuid),
  request_intent_private.retention_definition_sha256(regprocedure),
  request_intent_private.retention_staff_notice_locks_valid(),
  request_intent_private.retention_execution_bind_staff_locks(),
  public.request_intent_retention_execute(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.request_intent_retention_execute(uuid,uuid) to service_role;
commit;
