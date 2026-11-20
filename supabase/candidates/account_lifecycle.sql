-- SOURCE CANDIDATE ONLY. Canonical account-lifecycle operation extension.
-- No policy, assurance, domain/guard/provider authority or activation is seeded.
-- Never deletes Auth/domain records, grants roles, invokes a provider or schedules
-- work. Real ports/complete delegate pins and live coverage are separate owners.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local search_path=pg_catalog;
set local standard_conforming_strings=on;

do $preflight$
begin
 if current_setting('server_version_num')::int not between 170000 and 179999 then
  raise exception using errcode='55000',message='account_lifecycle_supported_pg17_required';end if;
 if current_user<>'postgres' or not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
  raise exception using errcode='42501',message='account_lifecycle_owner_required';end if;
 if pg_catalog.to_regnamespace('account_lifecycle_private') is not null
  or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like 'account_lifecycle_%') then
  raise exception using errcode='55000',message='account_lifecycle_existing_or_partial_installation';end if;
 if not exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attname='id' and not a.attisdropped
  join pg_catalog.pg_constraint k on k.conrelid=c.oid and k.contype='p' and k.convalidated and k.conkey=array[a.attnum]::smallint[]
  join pg_catalog.pg_index i on i.indexrelid=k.conindid and i.indisunique and i.indisvalid and i.indisready and i.indislive
  where n.nspname='auth' and c.relname='users' and c.relkind='r' and a.atttypid='pg_catalog.uuid'::regtype
   and not c.relispartition and not exists(select 1 from pg_catalog.pg_inherits h where h.inhrelid=c.oid or h.inhparent=c.oid)) then
  raise exception using errcode='55000',message='account_lifecycle_canonical_auth_required';end if;
end $preflight$;
create schema account_lifecycle_private;
revoke all on schema account_lifecycle_private from public,anon,authenticated,service_role;

create function account_lifecycle_private.only_keys(p_value jsonb,p_keys text[]) returns boolean
language sql immutable security invoker set search_path='' as $$
 select case when pg_catalog.jsonb_typeof(p_value) is distinct from 'object' then false else
  (select count(*) from pg_catalog.jsonb_object_keys(p_value))=pg_catalog.cardinality(p_keys)
  and not exists(select 1 from pg_catalog.jsonb_object_keys(p_value) k where not(k=any(p_keys))) end;
$$;
create function account_lifecycle_private.digest(p_value jsonb) returns text
language sql immutable security invoker set search_path='' as $$
 select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_value::text,'UTF8')),'hex');
$$;
create function account_lifecycle_private.utc(p_value timestamptz) returns text
language sql stable security invoker set search_path='' as $$
 select pg_catalog.to_char(p_value at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
$$;
create function account_lifecycle_private.instant(p_value text) returns timestamptz
language plpgsql stable security invoker set search_path='' as $$
declare result timestamptz;
begin
 if p_value is null or p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,6})?(Z|[+]00:00)$' then return null;end if;
 begin result:=p_value::timestamptz;exception when invalid_datetime_format or datetime_field_overflow then return null;end;
 if not pg_catalog.isfinite(result) then return null;end if;
 return result;
end $$;
create function account_lifecycle_private.progress_valid(p_value jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select case when account_lifecycle_private.only_keys(p_value,array['application','providerSessions','eligibleData','retainedData','authIdentity']) then
  not exists(select 1 from pg_catalog.jsonb_each(p_value) e where pg_catalog.jsonb_typeof(e.value) is distinct from 'string'
   or e.value#>>'{}' not in ('not_started','pending','verified','retained','unknown','blocked','not_applicable')) else false end;
$$;

create table account_lifecycle_private.bindings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 project_binding text check(project_binding ~ '^[a-f0-9]{64}$'),
 definition_pins jsonb not null default '[]'::jsonb check(pg_catalog.jsonb_typeof(definition_pins)='array'),
 check(not enabled or project_binding is not null)
);
insert into account_lifecycle_private.bindings(singleton) values(true);
create table account_lifecycle_private.operations (
 id uuid primary key,
 actor_id uuid not null,
 target_id uuid not null,
 mode text not null check(mode in ('self','admin')),
 attempt_id uuid not null,
 reason text not null check(reason in ('self_requested','privacy_request','security_response','authorized_admin_closure')),
 request_sha256 text not null check(request_sha256 ~ '^[a-f0-9]{64}$'),
 context jsonb not null check(pg_catalog.jsonb_typeof(context)='object'),
 policy_snapshot jsonb not null,
 authority_snapshot jsonb not null,
 dependency_snapshot jsonb not null,
 coverage_snapshot jsonb not null,
 preview_sha256 text check(preview_sha256 ~ '^[a-f0-9]{64}$'),
 preview_expires_at timestamptz,
 version bigint not null default 0 check(version between 0 and 9007199254740991),
 state text not null check(state in ('confirmation_required','closing','blocked','auth_deletion_pending','auth_outcome_unknown','completed_with_retention','completed','withdrawn_before_close')),
 progress jsonb not null check(account_lifecycle_private.progress_valid(progress)),
 blockers text[] not null default '{}',
 next_action text not null check(next_action in ('confirm','reauthenticate','wait','authorized_review','none')),
 execution_id uuid,
 execution_reserved_at timestamptz,
 auth_delete_mode text check(auth_delete_mode in ('hard','soft')),
 dispatch_sha256 text check(dispatch_sha256 ~ '^[a-f0-9]{64}$'),
 execution_state text not null default 'none' check(execution_state in ('none','reserved','uncertain','provider_confirmed','auth_absent_verified','refused')),
 provider_evidence_sha256 text check(provider_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default pg_catalog.clock_timestamp(),
 updated_at timestamptz not null default pg_catalog.clock_timestamp(),
 check(mode<>'self' or actor_id=target_id),
 check((execution_state='none')=(execution_id is null)),
 check((execution_id is null)=(execution_reserved_at is null)),
 check((execution_id is null)=(auth_delete_mode is null)),
 check((execution_id is null)=(dispatch_sha256 is null)),
 unique(target_id,attempt_id)
);
-- Deliberately no FK to auth.users: deleting Auth must not destroy or prevent
-- the operation/provenance needed to reconcile its uncertain result.
create table account_lifecycle_private.subject_state (
 target_id uuid primary key,
 operation_id uuid not null references account_lifecycle_private.operations(id),
 generation bigint not null check(generation between 1 and 9007199254740991),
 state text not null check(state in ('closing','closed')),
 coverage_revision text not null check(coverage_revision ~ '^[a-f0-9]{64}$'),
 closed_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table account_lifecycle_private.events (
 id bigint generated always as identity primary key,
 operation_id uuid not null references account_lifecycle_private.operations(id),
 version bigint not null,
 event_type text not null check(event_type in ('prepared','blocked','application_closed','auth_reserved','auth_outcome')),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default pg_catalog.clock_timestamp(),
 unique(operation_id,version)
);
-- A short-lived transaction capability, not a task/identity/outbox registry.
-- The deferred guard refuses any transaction that leaves one behind.
create table account_lifecycle_private.mutation_tickets (
 transaction_id xid8 not null,
 backend_pid integer not null,
 operation_id uuid not null,
 nonce uuid not null,
 primary key(transaction_id,backend_pid,operation_id)
);
do $private_tables$
declare name text;
begin
 foreach name in array array['bindings','operations','subject_state','events','mutation_tickets'] loop
  execute pg_catalog.format('alter table account_lifecycle_private.%I enable row level security',name);
  execute pg_catalog.format('alter table account_lifecycle_private.%I force row level security',name);
  execute pg_catalog.format('revoke all on table account_lifecycle_private.%I from public,anon,authenticated,service_role',name);
 end loop;
end $private_tables$;
revoke all on all sequences in schema account_lifecycle_private from public,anon,authenticated,service_role;

create function account_lifecycle_private.require_backend() returns void
language plpgsql volatile security invoker set search_path='' as $$
begin
 if pg_catalog.current_setting('role',true) is distinct from 'service_role' or auth.uid() is not null then
  raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
end $$;
create function account_lifecycle_private.require_isolation() returns void
language plpgsql volatile security invoker set search_path='' as $$
begin
 if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
  raise exception using errcode='25000',message='account_lifecycle_read_committed_required';end if;
end $$;
create function account_lifecycle_private.initial_progress() returns jsonb
language sql immutable security invoker set search_path='' as $$
 select '{"application":"not_started","providerSessions":"not_started","eligibleData":"unknown","retainedData":"unknown","authIdentity":"not_started"}'::jsonb;
$$;
create function account_lifecycle_private.unavailable(p_reason text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select pg_catalog.jsonb_build_object('protocol','account-lifecycle/v1','operationId',null,'version',null,'state','unavailable',
  'progress',account_lifecycle_private.initial_progress(),'preview',null,'blockers',pg_catalog.jsonb_build_array(p_reason),
  'nextAction',case when p_reason='recent_auth_required' then 'reauthenticate' else 'authorized_review' end);
$$;
create function account_lifecycle_private.project(p_row account_lifecycle_private.operations) returns jsonb
language sql stable security invoker set search_path='' as $$
 select pg_catalog.jsonb_build_object('protocol','account-lifecycle/v1','operationId',(p_row).id,'version',(p_row).version,
  'state',(p_row).state,'progress',(p_row).progress,
  'preview',case when (p_row).state='confirmation_required' then pg_catalog.jsonb_build_object(
   'digest',(p_row).preview_sha256,'expiresAt',account_lifecycle_private.utc((p_row).preview_expires_at),
   'policyRevision',(p_row).policy_snapshot->>'policyRevision','coverageRevision',(p_row).coverage_snapshot->>'revision') else null end,
  'blockers',pg_catalog.to_jsonb((p_row).blockers),'nextAction',(p_row).next_action);
$$;
create function account_lifecycle_private.open_frame(p_operation uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare token uuid:=pg_catalog.gen_random_uuid();
begin
 insert into account_lifecycle_private.mutation_tickets values(pg_catalog.pg_current_xact_id(),pg_catalog.pg_backend_pid(),p_operation,token);
 perform pg_catalog.set_config('xenios.account_lifecycle_nonce',token::text,true);
end $$;
create function account_lifecycle_private.close_frame(p_operation uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 delete from account_lifecycle_private.mutation_tickets where transaction_id=pg_catalog.pg_current_xact_id()
  and backend_pid=pg_catalog.pg_backend_pid() and operation_id=p_operation;
 perform pg_catalog.set_config('xenios.account_lifecycle_nonce','',true);
end $$;
create function account_lifecycle_private.frame_valid(p_operation uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from account_lifecycle_private.mutation_tickets where transaction_id=pg_catalog.pg_current_xact_id()
  and backend_pid=pg_catalog.pg_backend_pid() and operation_id=p_operation
  and nonce::text=pg_catalog.current_setting('xenios.account_lifecycle_nonce',true));
$$;
create function account_lifecycle_private.ticket_must_close() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if exists(select 1 from account_lifecycle_private.mutation_tickets where transaction_id=new.transaction_id
  and backend_pid=new.backend_pid and operation_id=new.operation_id) then
  raise exception using errcode='55000',message='account_lifecycle_incomplete_transaction';end if;
 return null;
end $$;
create constraint trigger account_lifecycle_ticket_must_close after insert on account_lifecycle_private.mutation_tickets
 deferrable initially deferred for each row execute function account_lifecycle_private.ticket_must_close();
create function account_lifecycle_private.state_valid(p_row account_lifecycle_private.operations) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare progress jsonb:=p_row.progress;
begin
 if exists(select 1 from pg_catalog.unnest(p_row.blockers) b where b is null or b not in (
  'recent_auth_required','assurance_unavailable','admin_authority_unavailable','policy_unavailable','policy_changed','preview_expired',
  'attempt_conflict','version_conflict','dependency_unknown','legal_hold','clinical_retention','financial_retention','last_owner_review',
  'shared_staff_review','guard_coverage_unavailable','unsupported_graph','erasure_authority_unavailable','auth_fk_unresolved',
  'storage_ownership_unresolved','provider_unqualified','provider_outcome_unknown','replay_cleanup_unproven')) then return false;end if;
 if p_row.state='confirmation_required' then
  return p_row.preview_sha256 is not null and p_row.preview_expires_at is not null
   and pg_catalog.cardinality(p_row.blockers)=0 and p_row.next_action='confirm' and progress->>'application'='not_started';
 elsif p_row.state='auth_deletion_pending' then
  return p_row.execution_id is null and p_row.execution_state='none'
   and progress->>'application'='verified' and progress->>'providerSessions' in ('verified','not_applicable')
   and progress->>'eligibleData' in ('verified','not_applicable') and progress->>'retainedData' in ('retained','not_applicable')
   and progress->>'authIdentity'='pending' and pg_catalog.cardinality(p_row.blockers)=0 and p_row.next_action='wait';
 elsif p_row.state='auth_outcome_unknown' then
  return progress->>'application'='verified' and progress->>'authIdentity'='unknown'
   and p_row.execution_id is not null and p_row.execution_state in ('reserved','uncertain')
   and 'provider_outcome_unknown'=any(p_row.blockers) and p_row.next_action in ('wait','authorized_review');
 elsif p_row.state in ('completed','completed_with_retention') then
  return progress->>'application'='verified' and progress->>'authIdentity'='verified'
   and progress->>'providerSessions' in ('verified','not_applicable') and progress->>'eligibleData' in ('verified','not_applicable')
   and p_row.execution_state in ('provider_confirmed','auth_absent_verified')
   and progress->>'retainedData'=(case when p_row.state='completed' then 'not_applicable' else 'retained' end)
   and pg_catalog.cardinality(p_row.blockers)=0 and p_row.next_action='none';
 elsif p_row.state='withdrawn_before_close' then return progress->>'application'='not_started';
 elsif p_row.state='blocked' then return pg_catalog.cardinality(p_row.blockers)>0 and p_row.next_action in ('reauthenticate','wait','authorized_review');
 end if;
 return true;
end $$;
create function account_lifecycle_private.operation_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception using errcode='42501',message='account_lifecycle_retention_authority_required';end if;
 if not account_lifecycle_private.frame_valid(new.id) then raise exception using errcode='42501',message='account_lifecycle_native_frame_required';end if;
 if not account_lifecycle_private.state_valid(new) then raise exception using errcode='22023',message='account_lifecycle_invalid_state';end if;
 if tg_op='UPDATE' then
  if (new.id,new.actor_id,new.target_id,new.mode,new.attempt_id,new.reason,new.request_sha256,new.context,new.policy_snapshot,
   new.authority_snapshot,new.dependency_snapshot,new.coverage_snapshot,new.preview_sha256,new.preview_expires_at,new.created_at)
   is distinct from (old.id,old.actor_id,old.target_id,old.mode,old.attempt_id,old.reason,old.request_sha256,old.context,old.policy_snapshot,
   old.authority_snapshot,old.dependency_snapshot,old.coverage_snapshot,old.preview_sha256,old.preview_expires_at,old.created_at)
   or new.version<>old.version+1 then raise exception using errcode='42501',message='account_lifecycle_immutable_operation';end if;
  if old.execution_id is not null and (new.execution_id,new.execution_reserved_at,new.auth_delete_mode,new.dispatch_sha256)
   is distinct from (old.execution_id,old.execution_reserved_at,old.auth_delete_mode,old.dispatch_sha256) then
   raise exception using errcode='42501',message='account_lifecycle_immutable_execution';end if;
  if old.execution_state in ('provider_confirmed','auth_absent_verified','refused')
   and (new.execution_state,new.provider_evidence_sha256) is distinct from (old.execution_state,old.provider_evidence_sha256) then
   raise exception using errcode='42501',message='account_lifecycle_immutable_execution';end if;
 end if;
 return new;
end $$;
create trigger account_lifecycle_operation_guard before insert or update or delete on account_lifecycle_private.operations
 for each row execute function account_lifecycle_private.operation_guard();
create function account_lifecycle_private.subject_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception using errcode='42501',message='account_lifecycle_retention_authority_required';end if;
 if tg_op='UPDATE' then raise exception using errcode='42501',message='account_lifecycle_immutable_closure';end if;
 if not account_lifecycle_private.frame_valid(new.operation_id) then raise exception using errcode='42501',message='account_lifecycle_native_frame_required';end if;
 if not exists(select 1 from account_lifecycle_private.operations o where o.id=new.operation_id and o.target_id=new.target_id) then
  raise exception using errcode='42501',message='account_lifecycle_immutable_closure';end if;
 return new;
end $$;
create trigger account_lifecycle_subject_guard before insert or update or delete on account_lifecycle_private.subject_state
 for each row execute function account_lifecycle_private.subject_guard();
create function account_lifecycle_private.event_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' or not account_lifecycle_private.frame_valid(new.operation_id) then
  raise exception using errcode='42501',message='account_lifecycle_immutable_audit';end if;
 if not exists(select 1 from account_lifecycle_private.operations where id=new.operation_id and version=new.version) then
  raise exception using errcode='55000',message='account_lifecycle_audit_revision_mismatch';end if;
 return new;
end $$;
create trigger account_lifecycle_event_guard before insert or update or delete on account_lifecycle_private.events
 for each row execute function account_lifecycle_private.event_guard();

create function account_lifecycle_private.definition_pins_valid(p_pins jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare item jsonb; routine pg_catalog.pg_proc; actual text; signature text;
begin
 if pg_catalog.jsonb_typeof(p_pins) is distinct from 'array' or pg_catalog.jsonb_array_length(p_pins) not between 4 and 256
  or pg_catalog.octet_length(p_pins::text)>262144 then return false;end if;
 if (select count(*) from pg_catalog.jsonb_array_elements(p_pins))<>(select count(distinct value->>'signature') from pg_catalog.jsonb_array_elements(p_pins)) then return false;end if;
 for item in select value from pg_catalog.jsonb_array_elements(p_pins) loop
  if not account_lifecycle_private.only_keys(item,array['signature','sha256','owner','isDefiner','language','volatility','resultType',
   'argumentNames','defaultCount','config','publicExecute','anonExecute','authenticatedExecute','serviceExecute'])
   or item->>'sha256' !~ '^[a-f0-9]{64}$' or pg_catalog.jsonb_typeof(item->'isDefiner') is distinct from 'boolean'
   or pg_catalog.jsonb_typeof(item->'publicExecute') is distinct from 'boolean' or pg_catalog.jsonb_typeof(item->'anonExecute') is distinct from 'boolean'
   or pg_catalog.jsonb_typeof(item->'authenticatedExecute') is distinct from 'boolean' or pg_catalog.jsonb_typeof(item->'serviceExecute') is distinct from 'boolean'
   or pg_catalog.jsonb_typeof(item->'argumentNames') is distinct from 'array' or item->>'defaultCount' !~ '^[0-9]{1,3}$'
   or pg_catalog.jsonb_typeof(item->'config') not in ('array','null') then return false;end if;
  signature:=item->>'signature';
  if signature is null or length(signature)>512 then return false;end if;
  select * into routine from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure(signature);
  if not found then return false;end if;
  actual:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(routine.oid),'UTF8')),'hex');
  if actual is distinct from item->>'sha256' or pg_catalog.pg_get_userbyid(routine.proowner) is distinct from item->>'owner'
   or routine.prokind<>'f' or routine.proretset or routine.prosecdef is distinct from (item->>'isDefiner')::boolean
   or (select lanname from pg_catalog.pg_language where oid=routine.prolang) is distinct from item->>'language'
   or routine.provolatile::text is distinct from item->>'volatility'
   or pg_catalog.pg_get_function_result(routine.oid) is distinct from item->>'resultType'
   or pg_catalog.to_jsonb(coalesce(routine.proargnames,array[]::text[])) is distinct from item->'argumentNames'
   or routine.pronargdefaults is distinct from (item->>'defaultCount')::int
   or coalesce(pg_catalog.to_jsonb(routine.proconfig),'null'::jsonb) is distinct from item->'config'
   or exists(select 1 from pg_catalog.aclexplode(coalesce(routine.proacl,pg_catalog.acldefault('f',routine.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
       is distinct from (item->>'publicExecute')::boolean
   or pg_catalog.has_function_privilege('anon',routine.oid,'EXECUTE') is distinct from (item->>'anonExecute')::boolean
   or pg_catalog.has_function_privilege('authenticated',routine.oid,'EXECUTE') is distinct from (item->>'authenticatedExecute')::boolean
   or pg_catalog.has_function_privilege('service_role',routine.oid,'EXECUTE') is distinct from (item->>'serviceExecute')::boolean then return false;end if;
 end loop;
 return true;
end $$;
create function account_lifecycle_private.required_ports_valid(p_pins jsonb,p_provider boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare item record; routine pg_catalog.pg_proc;
begin
 if not account_lifecycle_private.definition_pins_valid(p_pins) then return false;end if;
 if not exists(select 1 from pg_catalog.jsonb_array_elements(p_pins) e
  where e->>'signature'='account_lifecycle_private.native_guards_valid()') then return false;end if;
 for item in select * from (values
  ('account_lifecycle_private.policy_v1()','s',array[]::text[]),
  ('account_lifecycle_private.authorize_v1(uuid,uuid,text,text,text,timestamptz)','v',array['p_actor','p_target','p_mode','p_phase','p_assurance_ref','p_assurance_not_after']::text[]),
  ('account_lifecycle_private.dependencies_v1(uuid,text)','v',array['p_target','p_phase']::text[]),
  ('account_lifecycle_private.guard_coverage_v1()','s',array[]::text[]),
  ('account_lifecycle_private.provider_evidence_v1(uuid,uuid)','v',array['p_operation','p_execution']::text[])
 ) v(signature,volatility,argument_names) loop
  if item.signature='account_lifecycle_private.provider_evidence_v1(uuid,uuid)' and not p_provider then continue;end if;
  if not exists(select 1 from pg_catalog.jsonb_array_elements(p_pins) e where e->>'signature'=item.signature) then return false;end if;
  select * into routine from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure(item.signature);
  if not found then return false;end if;
  if pg_catalog.pg_get_userbyid(routine.proowner)<>'postgres' or not routine.prosecdef or routine.prokind<>'f' or routine.proretset
   or routine.provolatile::text<>item.volatility or routine.pronargdefaults<>0
   or coalesce(routine.proargnames,array[]::text[]) is distinct from item.argument_names
   or (select lanname from pg_catalog.pg_language where oid=routine.prolang)<>'plpgsql'
   or pg_catalog.pg_get_function_result(routine.oid)<>'jsonb'
   or routine.proconfig is null or routine.proconfig not in (array['search_path=""']::text[],array['search_path=']::text[])
   or exists(select 1 from pg_catalog.aclexplode(coalesce(routine.proacl,pg_catalog.acldefault('f',routine.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
   or pg_catalog.has_function_privilege('anon',routine.oid,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',routine.oid,'EXECUTE')
   or pg_catalog.has_function_privilege('service_role',routine.oid,'EXECUTE') then return false;end if;
 end loop;
 return true;
end $$;
create function account_lifecycle_private.ports_valid(p_provider boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select enabled and project_binding is not null
  and account_lifecycle_private.required_ports_valid(definition_pins,p_provider)
  from account_lifecycle_private.bindings where singleton),false);
$$;
create function account_lifecycle_private.context_valid(p_context jsonb,p_prepare boolean) returns boolean
language plpgsql stable security invoker set search_path='' as $$
begin
 if not account_lifecycle_private.only_keys(p_context,case when p_prepare then
  array['policyRevision','assuranceRef','sessionBinding','assuranceNotAfter','prepareNotAfter'] else array['assuranceRef','sessionBinding'] end)
  or pg_catalog.jsonb_typeof(p_context->'assuranceRef') is distinct from 'string' or p_context->>'assuranceRef' !~ '^[a-f0-9]{64}$'
  or pg_catalog.jsonb_typeof(p_context->'sessionBinding') is distinct from 'string' or p_context->>'sessionBinding' !~ '^[a-f0-9]{64}$' then return false;end if;
 if p_prepare and (pg_catalog.jsonb_typeof(p_context->'policyRevision') is distinct from 'string' or p_context->>'policyRevision' !~ '^[a-f0-9]{64}$'
  or account_lifecycle_private.instant(p_context->>'assuranceNotAfter') is null
  or account_lifecycle_private.instant(p_context->>'prepareNotAfter') is null) then return false;end if;
 return true;
end $$;
create function account_lifecycle_private.policy_valid(p_value jsonb) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare field text;
begin
 if not coalesce(account_lifecycle_private.only_keys(p_value,array['protocol','policyRevision','documentSha256','recordReference','approvalReference',
  'previewMaxSeconds','operationRetentionSeconds','evidenceRetentionSeconds','publishedAt'])
  and p_value->>'protocol'='account-lifecycle/policy/v1'
  and pg_catalog.jsonb_typeof(p_value->'policyRevision')='string' and p_value->>'policyRevision' ~ '^[a-f0-9]{64}$'
  and pg_catalog.jsonb_typeof(p_value->'documentSha256')='string' and p_value->>'documentSha256' ~ '^[a-f0-9]{64}$'
  and pg_catalog.jsonb_typeof(p_value->'recordReference')='string' and length(p_value->>'recordReference') between 1 and 200
  and pg_catalog.jsonb_typeof(p_value->'approvalReference')='string' and length(p_value->>'approvalReference') between 1 and 200
  and account_lifecycle_private.instant(p_value->>'publishedAt') is not null,false) then return false;end if;
 foreach field in array array['previewMaxSeconds','operationRetentionSeconds','evidenceRetentionSeconds'] loop
  -- Engineering representation bound, never a selected retention duration.
  if pg_catalog.jsonb_typeof(p_value->field) is distinct from 'number' or p_value->>field !~ '^[1-9][0-9]{0,9}$' then return false;end if;
  if (p_value->>field)::numeric>2147483647 then return false;end if;
 end loop;
 return true;
end $$;
create function account_lifecycle_private.coverage_valid(p_value jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare field text;
begin
 if not coalesce(account_lifecycle_private.only_keys(p_value,array['protocol','revision','applicationFenced','newWritersFenced','directAccessFenced','backoutCompatible','finiteReplaySafe','providerQualified'])
  and p_value->>'protocol'='account-lifecycle/coverage/v1' and pg_catalog.jsonb_typeof(p_value->'revision')='string'
  and p_value->>'revision' ~ '^[a-f0-9]{64}$',false) then return false;end if;
 foreach field in array array['applicationFenced','newWritersFenced','directAccessFenced','backoutCompatible','finiteReplaySafe','providerQualified'] loop
  if pg_catalog.jsonb_typeof(p_value->field) is distinct from 'boolean' then return false;end if;
 end loop;
 return true;
end $$;
create function account_lifecycle_private.dependencies_valid(p_value jsonb,p_target uuid) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb; names text[]:=array['identity','organizations','staff','care','finance','xri','referral','storage','unknown_dependencies'];
begin
 if not coalesce(account_lifecycle_private.only_keys(p_value,array['protocol','revision','targetId','domains','providerSessions','eligibleData','retainedData','authForeignKeysResolved','storageResolved','authDeletionMode'])
  and p_value->>'protocol'='account-lifecycle/dependencies/v1' and p_value->>'targetId'=p_target::text
  and pg_catalog.jsonb_typeof(p_value->'revision')='string' and p_value->>'revision' ~ '^[a-f0-9]{64}$'
  and pg_catalog.jsonb_typeof(p_value->'domains')='array'
  and pg_catalog.jsonb_typeof(p_value->'authForeignKeysResolved')='boolean' and pg_catalog.jsonb_typeof(p_value->'storageResolved')='boolean'
  and p_value->>'providerSessions' in ('pending','verified','unknown','blocked','not_applicable')
  and p_value->>'eligibleData' in ('pending','verified','unknown','blocked','not_applicable')
  and p_value->>'retainedData' in ('retained','unknown','blocked','not_applicable'),false) then return false;end if;
 if p_value->>'authDeletionMode' is null or p_value->>'authDeletionMode' not in ('hard','soft','unavailable') then return false;end if;
 if pg_catalog.jsonb_array_length(p_value->'domains')<>9 then return false;end if;
 if (select count(distinct value->>'domain') from pg_catalog.jsonb_array_elements(p_value->'domains'))<>9 then return false;end if;
 for item in select value from pg_catalog.jsonb_array_elements(p_value->'domains') loop
  if not coalesce(account_lifecycle_private.only_keys(item,array['domain','state','closure','erasure','authDelete','revision','evidenceSha256'])
   and item->>'domain'=any(names) and item->>'state' in ('known_none','hold','retention_required','erasure_eligible','unsupported','unknown')
   and item->>'closure' in ('allow','hold','unknown') and item->>'erasure' in ('none','eligible','retain','hold','unknown')
   and item->>'authDelete' in ('allow','hold','unknown') and pg_catalog.jsonb_typeof(item->'revision')='string'
   and item->>'revision' ~ '^[a-f0-9]{64}$' and pg_catalog.jsonb_typeof(item->'evidenceSha256')='string'
   and item->>'evidenceSha256' ~ '^[a-f0-9]{64}$',false) then return false;end if;
 end loop;
 return true;
end $$;

create function account_lifecycle_private.auth_lock_capable() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attname='id' and not a.attisdropped
  where n.nspname='auth' and c.relname='users' and pg_catalog.has_column_privilege(current_user,c.oid,a.attnum,'SELECT')
    and pg_catalog.has_any_column_privilege(current_user,c.oid,'UPDATE'));
$$;
create function account_lifecycle_private.lock_operation(p_actor uuid,p_target uuid,p_missing_target boolean default false) returns void
language plpgsql volatile security definer set search_path='' as $$
declare v_subject uuid;
begin
 perform account_lifecycle_private.require_isolation();
 if not account_lifecycle_private.auth_lock_capable() then raise exception using errcode='55000',message='account_lifecycle_auth_lock_unavailable';end if;
 perform pg_catalog.pg_advisory_xact_lock(9042026,1);
 -- All Auth locks precede every lifecycle lock: compatible with canonical
 -- Pack02's Auth FOR SHARE entry. Never take a lifecycle lock and wait on Auth.
 for v_subject in select distinct value from pg_catalog.unnest(array[p_actor,p_target]) value where value is not null order by value loop
  perform u.id from auth.users u where u.id=v_subject for update;
  if not found and not(p_missing_target and v_subject=p_target) then
   raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 end loop;
 for v_subject in select distinct value from pg_catalog.unnest(array[p_actor,p_target]) value where value is not null order by value loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-lifecycle/subject/v1:'||v_subject::text,0));
 end loop;
end $$;
create function account_lifecycle_private.authority_result(
 p_actor uuid,p_target uuid,p_mode text,p_phase text,p_attempt uuid,p_context jsonb,p_policy text,p_cap timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; action text; issued timestamptz; expiry timestamptz;
begin
 execute 'select account_lifecycle_private.authorize_v1($1,$2,$3,$4,$5,$6)' into result
  using p_actor,p_target,p_mode,p_phase,p_context->>'assuranceRef',p_cap;
 if account_lifecycle_private.only_keys(result,array['protocol','decision','reason'])
  and result->>'protocol'='account-lifecycle/authority/v1' and result->>'decision' in ('denied','unavailable')
  and result->>'reason' in ('recent_auth_required','assurance_unavailable','admin_authority_unavailable') then return result;end if;
 action:=case when p_phase='provider_dispatch' then 'provider_dispatch' when p_mode='self' then 'self_close'
  when p_phase='status' then 'global_status' else 'global_close' end;
 if not coalesce(account_lifecycle_private.only_keys(result,array['protocol','decision','actorId','targetId','mode','phase','sessionBinding',
  'policyRevision','issuedAttempt','issuedAt','notAfter','action']) and result->>'protocol'='account-lifecycle/authority/v1'
  and result->>'decision'='authorized' and result->>'actorId'=p_actor::text and result->>'targetId'=p_target::text
  and result->>'mode'=p_mode and result->>'phase'=p_phase and result->>'sessionBinding'=p_context->>'sessionBinding'
  and pg_catalog.jsonb_typeof(result->'policyRevision')='string' and result->>'policyRevision' ~ '^[a-f0-9]{64}$'
  and (p_policy is null or result->>'policyRevision'=p_policy) and result->>'issuedAttempt'=p_attempt::text and result->>'action'=action,false) then
  return pg_catalog.jsonb_build_object('protocol','account-lifecycle/authority/v1','decision','unavailable','reason',
    case when p_mode='admin' then 'admin_authority_unavailable' else 'assurance_unavailable' end);
 end if;
 issued:=account_lifecycle_private.instant(result->>'issuedAt'); expiry:=account_lifecycle_private.instant(result->>'notAfter');
 if issued is null or expiry is null or issued>pg_catalog.clock_timestamp() or issued>=expiry
  or (p_cap is not null and expiry>p_cap) or expiry<=pg_catalog.clock_timestamp() then
  return '{"protocol":"account-lifecycle/authority/v1","decision":"unavailable","reason":"recent_auth_required"}'::jsonb;
 end if;
 return result;
end $$;
create function account_lifecycle_private.bundle(p_actor uuid,p_target uuid,p_mode text,p_phase text,p_attempt uuid,p_context jsonb,p_cap timestamptz) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare policy jsonb; authority jsonb; dependencies jsonb; coverage jsonb; reason text;
begin
 if not account_lifecycle_private.native_guards_valid() then raise exception using errcode='55000',message='account_lifecycle_guard_unavailable';end if;
 if not account_lifecycle_private.ports_valid(false) then return pg_catalog.jsonb_build_object('reason',
  case when p_mode='admin' then 'admin_authority_unavailable' else 'policy_unavailable' end);end if;
 execute 'select account_lifecycle_private.policy_v1()' into policy;
 if not account_lifecycle_private.policy_valid(policy) or account_lifecycle_private.instant(policy->>'publishedAt')>pg_catalog.clock_timestamp() then
  return '{"reason":"policy_unavailable"}'::jsonb;end if;
 if policy->>'policyRevision' is distinct from p_context->>'policyRevision' then return '{"reason":"policy_changed"}'::jsonb;end if;
 authority:=account_lifecycle_private.authority_result(p_actor,p_target,p_mode,p_phase,p_attempt,p_context,policy->>'policyRevision',p_cap);
 if authority->>'decision' is distinct from 'authorized' then return pg_catalog.jsonb_build_object('reason',authority->>'reason');end if;
 execute 'select account_lifecycle_private.dependencies_v1($1,$2)' into dependencies using p_target,p_phase;
 execute 'select account_lifecycle_private.guard_coverage_v1()' into coverage;
 reason:=case when not account_lifecycle_private.dependencies_valid(dependencies,p_target) then 'dependency_unknown'
  when not account_lifecycle_private.coverage_valid(coverage) then 'guard_coverage_unavailable' else null end;
 -- Unexpected adapter/lock/cancellation errors deliberately propagate. No
 -- undefined-function/permission/deadlock failure is caught as false clearance.
 return pg_catalog.jsonb_build_object('reason',reason,'policy',policy,'authority',authority,
  'dependencies',case when account_lifecycle_private.dependencies_valid(dependencies,p_target) then dependencies else '{}'::jsonb end,
  'coverage',case when account_lifecycle_private.coverage_valid(coverage) then coverage else '{}'::jsonb end);
end $$;
create function account_lifecycle_private.closure_blockers(p_dependencies jsonb,p_coverage jsonb) returns text[]
language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb; result text[]:='{}'; code text;
begin
 if not account_lifecycle_private.coverage_valid(p_coverage) or not coalesce((p_coverage->>'applicationFenced')::boolean
  and (p_coverage->>'newWritersFenced')::boolean and (p_coverage->>'directAccessFenced')::boolean and (p_coverage->>'backoutCompatible')::boolean,false) then
  result:=array_append(result,'guard_coverage_unavailable');end if;
 for item in select value from pg_catalog.jsonb_array_elements(p_dependencies->'domains') loop
  code:=case when item->>'state'='unsupported' then 'unsupported_graph' when item->>'state'='unknown' or item->>'closure'='unknown' then 'dependency_unknown'
   when item->>'closure'<>'allow' then case item->>'domain' when 'organizations' then 'last_owner_review' when 'staff' then 'shared_staff_review'
     when 'care' then 'clinical_retention' when 'finance' then 'financial_retention' else 'legal_hold' end else null end;
  if code is not null and not(code=any(result)) then result:=array_append(result,code);end if;
 end loop;
 return result;
end $$;
create function account_lifecycle_private.dispatch_blockers(p_dependencies jsonb,p_coverage jsonb) returns text[]
language plpgsql stable security definer set search_path='' as $$
declare item jsonb; result text[]; code text;
begin
 result:=account_lifecycle_private.closure_blockers(p_dependencies,p_coverage);
 for item in select value from pg_catalog.jsonb_array_elements(p_dependencies->'domains') loop
  code:=case when item->>'authDelete'<>'allow' or item->>'erasure' in ('hold','unknown') or item->>'state'='hold' then
   case item->>'domain' when 'care' then 'clinical_retention' when 'finance' then 'financial_retention' else 'legal_hold' end else null end;
  if code is not null and not(code=any(result)) then result:=array_append(result,code);end if;
 end loop;
 if p_dependencies->>'eligibleData' not in ('verified','not_applicable') then result:=array_append(result,'erasure_authority_unavailable');end if;
 if p_dependencies->>'providerSessions' not in ('verified','not_applicable') then result:=array_append(result,'provider_unqualified');end if;
 if p_dependencies->>'retainedData' not in ('retained','not_applicable') then result:=array_append(result,'dependency_unknown');end if;
 if not(p_dependencies->>'authForeignKeysResolved')::boolean then result:=array_append(result,'auth_fk_unresolved');end if;
 if not(p_dependencies->>'storageResolved')::boolean then result:=array_append(result,'storage_ownership_unresolved');end if;
 if p_dependencies->>'authDeletionMode'='unavailable' then result:=array_append(result,'provider_unqualified');end if;
 if not(p_coverage->>'finiteReplaySafe')::boolean then result:=array_append(result,'replay_cleanup_unproven');end if;
 if not(p_coverage->>'providerQualified')::boolean or not account_lifecycle_private.ports_valid(true) then result:=array_append(result,'provider_unqualified');end if;
 return array(select distinct value from pg_catalog.unnest(result) value order by value);
end $$;
create function account_lifecycle_private.record_event(p_operation uuid,p_event text,p_evidence jsonb) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 insert into account_lifecycle_private.events(operation_id,version,event_type,evidence_sha256)
  select id,version,p_event,account_lifecycle_private.digest(p_evidence) from account_lifecycle_private.operations where id=p_operation;
end $$;
create function account_lifecycle_private.block_operation(p_operation uuid,p_reasons text[]) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare stored account_lifecycle_private.operations;
begin
 select * into strict stored from account_lifecycle_private.operations where id=p_operation;
 if stored.execution_state in ('reserved','uncertain') and not('provider_outcome_unknown'=any(p_reasons)) then
  p_reasons:=array_append(p_reasons,'provider_outcome_unknown');end if;
 perform account_lifecycle_private.open_frame(p_operation);
 update account_lifecycle_private.operations set state='blocked',blockers=p_reasons,
  next_action=case when p_reasons=array['recent_auth_required']::text[] then 'reauthenticate' else 'authorized_review' end,
  version=version+1,updated_at=pg_catalog.clock_timestamp() where id=p_operation returning * into strict stored;
 perform account_lifecycle_private.record_event(p_operation,'blocked',pg_catalog.to_jsonb(p_reasons));
 perform account_lifecycle_private.close_frame(p_operation);
 return account_lifecycle_private.project(stored);
end $$;

create function account_lifecycle_private.prepare(
 p_actor uuid,p_target uuid,p_mode text,p_attempt uuid,p_reason text,p_context jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare stored account_lifecycle_private.operations; request_digest text; facts jsonb; reasons text[]; expiry timestamptz;
 operation_id uuid:=pg_catalog.gen_random_uuid(); preview text; prepared_state text;
begin
 perform account_lifecycle_private.require_backend();
 if p_actor is null or p_target is null or p_attempt is null or p_actor='00000000-0000-0000-0000-000000000000'::uuid
  or p_target='00000000-0000-0000-0000-000000000000'::uuid or p_attempt='00000000-0000-0000-0000-000000000000'::uuid
  or p_mode is null or p_mode not in ('self','admin') or not account_lifecycle_private.context_valid(p_context,true)
  or p_reason is null or p_reason not in ('self_requested','privacy_request','security_response','authorized_admin_closure') then
  raise exception using errcode='22023',message='account_lifecycle_invalid';end if;
 if (p_mode='self' and (p_actor<>p_target or p_reason<>'self_requested')) or (p_mode='admin' and p_reason='self_requested') then
  raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 request_digest:=account_lifecycle_private.digest(pg_catalog.jsonb_build_array(p_actor,p_target,p_mode,p_attempt,p_reason,p_context));
 -- Scoped persisted replay is read-only and does not renew issuance/preview.
 select * into stored from account_lifecycle_private.operations where target_id=p_target and attempt_id=p_attempt;
 if found then
  if stored.actor_id<>p_actor or stored.mode<>p_mode or stored.request_sha256<>request_digest then
   raise exception using errcode='23505',message='account_lifecycle_attempt_conflict';end if;
  return account_lifecycle_private.project(stored);
 end if;
 if not account_lifecycle_private.auth_lock_capable() then return account_lifecycle_private.unavailable('assurance_unavailable');end if;
 perform account_lifecycle_private.lock_operation(p_actor,p_target,false);
 perform singleton from account_lifecycle_private.bindings where singleton for share;
 select * into stored from account_lifecycle_private.operations where target_id=p_target and attempt_id=p_attempt;
 if found then
  if stored.actor_id<>p_actor or stored.mode<>p_mode or stored.request_sha256<>request_digest then
   raise exception using errcode='23505',message='account_lifecycle_attempt_conflict';end if;
  return account_lifecycle_private.project(stored);
 end if;
 if exists(select 1 from account_lifecycle_private.subject_state where target_id=p_target) then
  raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 if not account_lifecycle_private.native_guards_valid() then return account_lifecycle_private.unavailable('guard_coverage_unavailable');end if;
 facts:=account_lifecycle_private.bundle(p_actor,p_target,p_mode,'prepare',p_attempt,p_context,
  account_lifecycle_private.instant(p_context->>'assuranceNotAfter'));
 if facts->>'reason' is not null and not(facts ? 'policy') then return account_lifecycle_private.unavailable(facts->>'reason');end if;
 reasons:=case when facts->>'reason' is not null then array[facts->>'reason'] else
  account_lifecycle_private.closure_blockers(facts->'dependencies',facts->'coverage') end;
 expiry:=least(account_lifecycle_private.instant(p_context->>'prepareNotAfter'),
  account_lifecycle_private.instant(p_context->>'assuranceNotAfter'),account_lifecycle_private.instant(facts->'authority'->>'notAfter'),
  account_lifecycle_private.instant(facts->'authority'->>'issuedAt')+(facts->'policy'->>'previewMaxSeconds')::int*interval '1 second');
 if expiry is null or expiry<=pg_catalog.clock_timestamp() then reasons:=array['preview_expired'];end if;
 prepared_state:=case when pg_catalog.cardinality(reasons)=0 then 'confirmation_required' else 'blocked' end;
 preview:=account_lifecycle_private.digest(pg_catalog.jsonb_build_array(operation_id,request_digest,facts,
  account_lifecycle_private.utc(expiry)));
 perform account_lifecycle_private.open_frame(operation_id);
 insert into account_lifecycle_private.operations(id,actor_id,target_id,mode,attempt_id,reason,request_sha256,context,
  policy_snapshot,authority_snapshot,dependency_snapshot,coverage_snapshot,preview_sha256,preview_expires_at,state,progress,blockers,next_action)
 values(operation_id,p_actor,p_target,p_mode,p_attempt,p_reason,request_digest,p_context,
  facts->'policy',facts->'authority',facts->'dependencies',facts->'coverage',preview,expiry,prepared_state,
  account_lifecycle_private.initial_progress(),reasons,case when prepared_state='confirmation_required' then 'confirm' else 'authorized_review' end)
 returning * into stored;
 perform account_lifecycle_private.record_event(operation_id,case when prepared_state='blocked' then 'blocked' else 'prepared' end,
  pg_catalog.jsonb_build_object('preview',preview,'reasons',reasons));
 perform account_lifecycle_private.close_frame(operation_id);
 return account_lifecycle_private.project(stored);
end $$;
create function account_lifecycle_private.confirm(
 p_actor uuid,p_operation uuid,p_preview_sha256 text,p_expected_version bigint,p_context jsonb,p_mode text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare stored account_lifecycle_private.operations; facts jsonb; current_context jsonb; reasons text[]; v_progress jsonb;
 head account_lifecycle_private.subject_state;
begin
 perform account_lifecycle_private.require_backend();
 if p_actor is null or p_operation is null or p_expected_version is null or p_expected_version<0 or p_expected_version>9007199254740991
  or p_preview_sha256 is null or p_preview_sha256 !~ '^[a-f0-9]{64}$'
  or not account_lifecycle_private.context_valid(p_context,false) then raise exception using errcode='22023',message='account_lifecycle_invalid';end if;
 select * into stored from account_lifecycle_private.operations where id=p_operation and actor_id=p_actor and mode=p_mode;
 if not found then raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 -- Confirmation is a one-time closure decision. Persisted closure/dispatch
 -- results remain read-only even when blocked, expired or temporarily unready.
 if stored.state in ('completed','completed_with_retention','auth_outcome_unknown','withdrawn_before_close')
  or stored.progress->>'application'='verified' or stored.execution_id is not null
  or exists(select 1 from account_lifecycle_private.subject_state where target_id=stored.target_id and operation_id=p_operation) then
  -- The head query may observe a newer commit than the first operation read.
  select * into strict stored from account_lifecycle_private.operations where id=p_operation;
  return account_lifecycle_private.project(stored);end if;
 perform account_lifecycle_private.lock_operation(p_actor,stored.target_id,false);
 perform singleton from account_lifecycle_private.bindings where singleton for share;
 select * into strict stored from account_lifecycle_private.operations where id=p_operation for update;
 -- A concurrent confirmation can commit while this call waits for the locks.
 -- Do not re-enter confirmation/CAS/expiry or replace its durable result.
 if stored.state in ('completed','completed_with_retention','auth_outcome_unknown','withdrawn_before_close')
  or stored.progress->>'application'='verified' or stored.execution_id is not null
  or exists(select 1 from account_lifecycle_private.subject_state where target_id=stored.target_id and operation_id=p_operation) then
  return account_lifecycle_private.project(stored);end if;
 if stored.version<>p_expected_version then raise exception using errcode='P0001',message='account_lifecycle_version_conflict';end if;
 if p_context->>'sessionBinding' is distinct from stored.context->>'sessionBinding'
  or p_preview_sha256 is distinct from stored.preview_sha256 then raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 if not account_lifecycle_private.native_guards_valid() then raise exception using errcode='55000',message='account_lifecycle_guard_unavailable';end if;
 if stored.preview_expires_at<=pg_catalog.clock_timestamp() then return account_lifecycle_private.block_operation(p_operation,array['preview_expired']);end if;
 select * into head from account_lifecycle_private.subject_state where target_id=stored.target_id;
 if found and head.operation_id<>p_operation then return account_lifecycle_private.block_operation(p_operation,array['attempt_conflict']);end if;
 current_context:=stored.context||p_context;
 facts:=account_lifecycle_private.bundle(p_actor,stored.target_id,p_mode,'confirm',stored.attempt_id,current_context,
  account_lifecycle_private.instant(stored.context->>'assuranceNotAfter'));
 if facts->>'reason' is not null then return account_lifecycle_private.block_operation(p_operation,array[facts->>'reason']);end if;
 if facts->'policy' is distinct from stored.policy_snapshot or facts->'dependencies' is distinct from stored.dependency_snapshot
  or facts->'coverage' is distinct from stored.coverage_snapshot then
  return account_lifecycle_private.block_operation(p_operation,array['policy_changed']);end if;
 reasons:=account_lifecycle_private.closure_blockers(facts->'dependencies',facts->'coverage');
 if pg_catalog.cardinality(reasons)>0 then return account_lifecycle_private.block_operation(p_operation,reasons);end if;
 v_progress:=pg_catalog.jsonb_build_object('application','verified','providerSessions',facts->'dependencies'->>'providerSessions',
  'eligibleData',facts->'dependencies'->>'eligibleData','retainedData',facts->'dependencies'->>'retainedData','authIdentity','pending');
 reasons:=account_lifecycle_private.dispatch_blockers(facts->'dependencies',facts->'coverage');
 perform account_lifecycle_private.open_frame(p_operation);
 insert into account_lifecycle_private.subject_state(target_id,operation_id,generation,state,coverage_revision)
  values(stored.target_id,p_operation,1,'closed',facts->'coverage'->>'revision') on conflict(target_id) do nothing returning * into head;
 if not found then
  select * into strict head from account_lifecycle_private.subject_state where target_id=stored.target_id;
  if head.operation_id<>p_operation then raise exception using errcode='23505',message='account_lifecycle_attempt_conflict';end if;
 end if;
 update account_lifecycle_private.operations set state=case when pg_catalog.cardinality(reasons)=0 then 'auth_deletion_pending' else 'blocked' end,
  progress=v_progress,blockers=reasons,next_action=case when pg_catalog.cardinality(reasons)=0 then 'wait' else 'authorized_review' end,
  version=version+1,updated_at=pg_catalog.clock_timestamp() where id=p_operation returning * into stored;
 perform account_lifecycle_private.record_event(p_operation,'application_closed',facts);
 perform account_lifecycle_private.close_frame(p_operation);
 return account_lifecycle_private.project(stored);
end $$;
create function account_lifecycle_private.status(p_actor uuid,p_operation uuid,p_context jsonb,p_mode text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare stored account_lifecycle_private.operations; authorization jsonb;
begin
 perform account_lifecycle_private.require_backend();
 if p_actor is null or p_operation is null then raise exception using errcode='22023',message='account_lifecycle_invalid';end if;
 select * into stored from account_lifecycle_private.operations where id=p_operation;
 if not found then raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 if p_mode='self' then
  if stored.mode<>'self' or stored.actor_id<>p_actor or stored.target_id<>p_actor then raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 else
  if not account_lifecycle_private.context_valid(p_context,false) then raise exception using errcode='22023',message='account_lifecycle_invalid';end if;
  if not account_lifecycle_private.ports_valid(false) then raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
  authorization:=account_lifecycle_private.authority_result(p_actor,stored.target_id,'admin','status',stored.attempt_id,
   p_context,null,null);
  if authorization->>'decision' is distinct from 'authorized' then raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 end if;
 return account_lifecycle_private.project(stored);
end $$;

create function account_lifecycle_private.guard_subject_after_auth(p_subject uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 perform account_lifecycle_private.require_isolation();
 if p_subject is null then raise exception using errcode='22023',message='account_lifecycle_invalid';end if;
 -- Narrow future canonical-writer seam. It never acquires the V1 global lock
 -- AFTER Auth: V1 writers must take that first at their own entry. Existing
 -- Pack02 callers can take Auth then this lifecycle lock without inversion.
 perform u.id from auth.users u where u.id=p_subject for share;
 if not found then raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-lifecycle/subject/v1:'||p_subject::text,0));
 if exists(select 1 from account_lifecycle_private.subject_state where target_id=p_subject) then
  raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
end $$;
create function account_lifecycle_private.access_state(p_subject uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare head account_lifecycle_private.subject_state; coverage jsonb;
begin
 if p_subject is null then raise exception using errcode='22023',message='account_lifecycle_invalid';end if;
 select * into head from account_lifecycle_private.subject_state where target_id=p_subject;
 if found then return pg_catalog.jsonb_build_object('state',head.state,'generation',head.generation);end if;
 if pg_catalog.current_setting('transaction_isolation')<>'read committed' then return '{"state":"unavailable","generation":0}'::jsonb;end if;
 if not account_lifecycle_private.native_guards_valid() or not account_lifecycle_private.ports_valid(false) then
  return '{"state":"unavailable","generation":0}'::jsonb;end if;
 execute 'select account_lifecycle_private.guard_coverage_v1()' into coverage;
 if not account_lifecycle_private.coverage_valid(coverage) then return '{"state":"unavailable","generation":0}'::jsonb;end if;
 if not((coverage->>'applicationFenced')::boolean and (coverage->>'newWritersFenced')::boolean
  and (coverage->>'directAccessFenced')::boolean and (coverage->>'backoutCompatible')::boolean) then
  return '{"state":"unavailable","generation":0}'::jsonb;end if;
 return '{"state":"open","generation":0}'::jsonb;
end $$;
create function account_lifecycle_private.claim_auth_delete(p_operation uuid,p_expected_version bigint,p_execution uuid) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare stored account_lifecycle_private.operations; facts jsonb; reasons text[]; head account_lifecycle_private.subject_state; dispatch_digest text; project_digest text;
begin
 if current_user<>'postgres' then raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 if p_operation is null or p_execution is null or p_expected_version is null then raise exception using errcode='22023',message='account_lifecycle_invalid';end if;
 select * into stored from account_lifecycle_private.operations where id=p_operation;
 if not found then raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 perform account_lifecycle_private.lock_operation(stored.actor_id,stored.target_id,false);
 perform singleton from account_lifecycle_private.bindings where singleton for share;
 select * into strict stored from account_lifecycle_private.operations where id=p_operation for update;
 if stored.execution_id is not null then return pg_catalog.jsonb_build_object('decision','already_reserved','operationId',p_operation,
  'executionId',stored.execution_id,'status',account_lifecycle_private.project(stored));end if;
 if stored.version<>p_expected_version then raise exception using errcode='P0001',message='account_lifecycle_version_conflict';end if;
 select * into head from account_lifecycle_private.subject_state where target_id=stored.target_id and operation_id=p_operation;
 if not found or stored.progress->>'application'<>'verified' then
  return pg_catalog.jsonb_build_object('decision','blocked','status',account_lifecycle_private.block_operation(p_operation,array['guard_coverage_unavailable']));end if;
 facts:=account_lifecycle_private.bundle(stored.actor_id,stored.target_id,stored.mode,'provider_dispatch',stored.attempt_id,stored.context,
  account_lifecycle_private.instant(stored.context->>'assuranceNotAfter'));
 if facts->>'reason' is not null then reasons:=array[facts->>'reason'];
 elsif facts->'policy' is distinct from stored.policy_snapshot or facts->'coverage' is distinct from stored.coverage_snapshot then reasons:=array['policy_changed'];
 else reasons:=account_lifecycle_private.dispatch_blockers(facts->'dependencies',facts->'coverage');end if;
 if pg_catalog.cardinality(reasons)>0 then return pg_catalog.jsonb_build_object('decision','blocked','status',account_lifecycle_private.block_operation(p_operation,reasons));end if;
 select project_binding into strict project_digest from account_lifecycle_private.bindings where singleton;
 dispatch_digest:=account_lifecycle_private.digest(pg_catalog.jsonb_build_array(p_operation,p_execution,stored.target_id,
  stored.request_sha256,facts->'dependencies'->>'authDeletionMode',project_digest,facts->'policy',facts->'dependencies',facts->'coverage'));
 perform account_lifecycle_private.open_frame(p_operation);
 -- Conservative at-most-once reservation: even a lost claim response remains
 -- unknown. No TTL or alternate execution can authorize a second provider call.
 update account_lifecycle_private.operations set execution_id=p_execution,execution_reserved_at=pg_catalog.clock_timestamp(),execution_state='reserved',state='auth_outcome_unknown',
  auth_delete_mode=facts->'dependencies'->>'authDeletionMode',dispatch_sha256=dispatch_digest,
  progress=pg_catalog.jsonb_set(progress,'{authIdentity}','"unknown"'::jsonb),blockers=array['provider_outcome_unknown'],next_action='wait',
  version=version+1,updated_at=pg_catalog.clock_timestamp() where id=p_operation returning * into stored;
 perform account_lifecycle_private.record_event(p_operation,'auth_reserved',pg_catalog.jsonb_build_object('execution',p_execution,'facts',facts));
 perform account_lifecycle_private.close_frame(p_operation);
 return pg_catalog.jsonb_build_object('decision','reserved','operationId',p_operation,'executionId',p_execution,'targetId',stored.target_id,
  'requestDigest',stored.request_sha256,'dispatchDigest',stored.dispatch_sha256,'deleteMode',stored.auth_delete_mode,'status',account_lifecycle_private.project(stored));
end $$;
create function account_lifecycle_private.finish_auth_delete(p_operation uuid,p_execution uuid,p_outcome text,p_evidence_sha256 text) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare stored account_lifecycle_private.operations; evidence jsonb; cfg account_lifecycle_private.bindings;
 policy jsonb; dependencies jsonb; coverage jsonb; reasons text[]:='{}'; v_progress jsonb; v_state text;
begin
 if current_user<>'postgres' then raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 if p_operation is null or p_execution is null or p_evidence_sha256 is null or p_evidence_sha256 !~ '^[a-f0-9]{64}$'
  or p_outcome is null or p_outcome not in ('provider_confirmed','auth_absent_verified','uncertain','refused') then
  raise exception using errcode='22023',message='account_lifecycle_invalid';end if;
 select * into stored from account_lifecycle_private.operations where id=p_operation;
 if not found then raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 -- Fact completion is not new deletion authority. The Auth target may already
 -- be absent; only its stored, closed, exact execution can be reconciled.
 perform account_lifecycle_private.lock_operation(null,stored.target_id,true);
 perform singleton from account_lifecycle_private.bindings where singleton for share;
 select * into strict stored from account_lifecycle_private.operations where id=p_operation for update;
 if stored.execution_id is distinct from p_execution or stored.progress->>'application'<>'verified' then
  raise exception using errcode='42501',message='account_lifecycle_forbidden';end if;
 if stored.execution_state=p_outcome and stored.provider_evidence_sha256=p_evidence_sha256 then return account_lifecycle_private.project(stored);end if;
 if stored.execution_state in ('provider_confirmed','auth_absent_verified','refused') then
  if stored.execution_state=p_outcome and stored.provider_evidence_sha256=p_evidence_sha256 then return account_lifecycle_private.project(stored);end if;
  raise exception using errcode='23505',message='account_lifecycle_evidence_conflict';
 end if;
 if not account_lifecycle_private.native_guards_valid() then raise exception using errcode='55000',message='account_lifecycle_guard_unavailable';end if;
 if not account_lifecycle_private.ports_valid(true) then return account_lifecycle_private.block_operation(p_operation,array['provider_unqualified','provider_outcome_unknown']);end if;
 select * into strict cfg from account_lifecycle_private.bindings where singleton;
 execute 'select account_lifecycle_private.provider_evidence_v1($1,$2)' into evidence using p_operation,p_execution;
 if not coalesce(account_lifecycle_private.only_keys(evidence,array['protocol','operationId','executionId','targetId','requestDigest',
  'dispatchDigest','requestedDeleteMode','outcome','evidenceSha256','observedAt','projectBinding']) and evidence->>'protocol'='account-lifecycle/provider-evidence/v1'
  and evidence->>'operationId'=p_operation::text and evidence->>'executionId'=p_execution::text and evidence->>'targetId'=stored.target_id::text
  and evidence->>'requestDigest'=stored.request_sha256 and evidence->>'outcome'=p_outcome
  and evidence->>'dispatchDigest'=stored.dispatch_sha256 and evidence->>'requestedDeleteMode'=stored.auth_delete_mode
  and evidence->>'evidenceSha256'=p_evidence_sha256 and evidence->>'projectBinding'=cfg.project_binding
  and account_lifecycle_private.instant(evidence->>'observedAt') is not null,false) then
  return account_lifecycle_private.block_operation(p_operation,array['provider_unqualified','provider_outcome_unknown']);end if;
 if account_lifecycle_private.instant(evidence->>'observedAt')>pg_catalog.clock_timestamp()
  or account_lifecycle_private.instant(evidence->>'observedAt')<stored.execution_reserved_at then
  return account_lifecycle_private.block_operation(p_operation,array['provider_unqualified','provider_outcome_unknown']);end if;
 v_progress:=stored.progress;
 if p_outcome in ('provider_confirmed','auth_absent_verified') then
  v_progress:=pg_catalog.jsonb_set(v_progress,'{authIdentity}','"verified"'::jsonb);
  execute 'select account_lifecycle_private.policy_v1()' into policy;
  execute 'select account_lifecycle_private.dependencies_v1($1,$2)' into dependencies using stored.target_id,'completion';
  execute 'select account_lifecycle_private.guard_coverage_v1()' into coverage;
  if not account_lifecycle_private.policy_valid(policy) or policy is distinct from stored.policy_snapshot then reasons:=array['policy_changed'];
  elsif not account_lifecycle_private.dependencies_valid(dependencies,stored.target_id) then reasons:=array['dependency_unknown'];
  elsif dependencies->>'authDeletionMode' is distinct from stored.auth_delete_mode then reasons:=array['policy_changed'];
  elsif not account_lifecycle_private.coverage_valid(coverage) then reasons:=array['guard_coverage_unavailable'];
  else
   reasons:=account_lifecycle_private.dispatch_blockers(dependencies,coverage);
   v_progress:=v_progress||pg_catalog.jsonb_build_object('providerSessions',dependencies->>'providerSessions','eligibleData',dependencies->>'eligibleData','retainedData',dependencies->>'retainedData');
  end if;
  v_state:=case when pg_catalog.cardinality(reasons)>0 then 'blocked' when v_progress->>'retainedData'='retained' then 'completed_with_retention' else 'completed' end;
 elsif p_outcome='refused' then
  v_progress:=pg_catalog.jsonb_set(v_progress,'{authIdentity}','"blocked"'::jsonb); reasons:=array['provider_unqualified'];v_state:='blocked';
 else
  v_progress:=pg_catalog.jsonb_set(v_progress,'{authIdentity}','"unknown"'::jsonb); reasons:=array['provider_outcome_unknown'];v_state:='auth_outcome_unknown';
 end if;
 perform account_lifecycle_private.open_frame(p_operation);
 update account_lifecycle_private.operations set execution_state=p_outcome,provider_evidence_sha256=p_evidence_sha256,
  state=v_state,progress=v_progress,blockers=reasons,next_action=case when v_state in ('completed','completed_with_retention') then 'none'
    when v_state='auth_outcome_unknown' then 'wait' else 'authorized_review' end,
  version=version+1,updated_at=pg_catalog.clock_timestamp() where id=p_operation returning * into stored;
 perform account_lifecycle_private.record_event(p_operation,'auth_outcome',evidence);
 perform account_lifecycle_private.close_frame(p_operation);
 return account_lifecycle_private.project(stored);
end $$;
create function account_lifecycle_private.cleanup_eligible(p_operation uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare stored account_lifecycle_private.operations; policy jsonb; dependencies jsonb; coverage jsonb;
begin
 select * into stored from account_lifecycle_private.operations where id=p_operation;
 if not found or stored.state not in ('completed','completed_with_retention')
  or not account_lifecycle_private.native_guards_valid() or not account_lifecycle_private.ports_valid(true) then return false;end if;
 if exists(select 1 from auth.users where id=stored.target_id) then return false;end if;
 if pg_catalog.clock_timestamp()<stored.created_at+greatest((stored.policy_snapshot->>'operationRetentionSeconds')::int,
  (stored.policy_snapshot->>'evidenceRetentionSeconds')::int)*interval '1 second' then return false;end if;
 execute 'select account_lifecycle_private.policy_v1()' into policy;
 execute 'select account_lifecycle_private.dependencies_v1($1,$2)' into dependencies using stored.target_id,'cleanup';
 execute 'select account_lifecycle_private.guard_coverage_v1()' into coverage;
 if policy is distinct from stored.policy_snapshot or not account_lifecycle_private.dependencies_valid(dependencies,stored.target_id)
  or not account_lifecycle_private.coverage_valid(coverage) then return false;end if;
 return pg_catalog.cardinality(account_lifecycle_private.dispatch_blockers(dependencies,coverage))=0;
 -- Eligibility is read-only. This candidate supplies NO operation/head/audit or
 -- domain erasure function, indefinite tombstone policy or late-issuer waiver.
end $$;

create function public.account_lifecycle_prepare_self(p_actor uuid,p_attempt uuid,p_context jsonb) returns jsonb
language sql volatile security definer set search_path='' as $$
 select account_lifecycle_private.prepare(p_actor,p_actor,'self',p_attempt,'self_requested',p_context);
$$;
create function public.account_lifecycle_prepare_admin(p_actor uuid,p_target uuid,p_attempt uuid,p_reason text,p_context jsonb) returns jsonb
language sql volatile security definer set search_path='' as $$
 select account_lifecycle_private.prepare(p_actor,p_target,'admin',p_attempt,p_reason,p_context);
$$;
create function public.account_lifecycle_confirm_self(p_actor uuid,p_operation uuid,p_preview_sha256 text,p_expected_version bigint,p_context jsonb) returns jsonb
language sql volatile security definer set search_path='' as $$
 select account_lifecycle_private.confirm(p_actor,p_operation,p_preview_sha256,p_expected_version,p_context,'self');
$$;
create function public.account_lifecycle_confirm_admin(p_actor uuid,p_operation uuid,p_preview_sha256 text,p_expected_version bigint,p_context jsonb) returns jsonb
language sql volatile security definer set search_path='' as $$
 select account_lifecycle_private.confirm(p_actor,p_operation,p_preview_sha256,p_expected_version,p_context,'admin');
$$;
create function public.account_lifecycle_status_self(p_actor uuid,p_operation uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
 select account_lifecycle_private.status(p_actor,p_operation,null,'self');
$$;
create function public.account_lifecycle_status_admin(p_actor uuid,p_operation uuid,p_context jsonb) returns jsonb
language sql volatile security definer set search_path='' as $$
 select account_lifecycle_private.status(p_actor,p_operation,p_context,'admin');
$$;
-- Root's future guard adapter only, not an additional customer CRUD endpoint.
create function public.account_lifecycle_access_state(p_subject uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 perform account_lifecycle_private.require_backend();
 return account_lifecycle_private.access_state(p_subject);
end $$;
create function account_lifecycle_private.binding_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if pg_catalog.current_setting('role',true) in ('anon','authenticated','service_role') then
  raise exception using errcode='42501',message='account_lifecycle_owner_required';end if;
 if new.enabled and (not account_lifecycle_private.native_guards_valid()
  or not account_lifecycle_private.required_ports_valid(new.definition_pins,false)) then
  raise exception using errcode='55000',message='account_lifecycle_unqualified_binding';end if;
 return new;
end $$;
create trigger account_lifecycle_binding_guard before insert or update on account_lifecycle_private.bindings
 for each row execute function account_lifecycle_private.binding_guard();

create function account_lifecycle_private.native_guards_valid() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare item record; routine pg_catalog.pg_proc; actual text; relation pg_catalog.pg_class;
begin
 if not exists(select 1 from pg_catalog.pg_namespace n where n.nspname='account_lifecycle_private'
  and pg_catalog.pg_get_userbyid(n.nspowner)='postgres'
  and not exists(select 1 from pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a where a.grantee<>n.nspowner)) then return false;end if;
 for item in select * from (values
  ('account_lifecycle_private.only_keys(jsonb,text[])','8842bd839e8cec55bc05df51fd20ae98a0c1a868b4647c31999c0fa46f6abc55',false,'sql','i','boolean',array['p_value','p_keys']::text[],0,null::text,false),
  ('account_lifecycle_private.digest(jsonb)','100529b93fd301990fdf3e8fbf8c5c11d855a2a7bdf4466caf79a4f47fbfb3d3',false,'sql','i','text',array['p_value']::text[],0,null::text,false),
  ('account_lifecycle_private.utc(timestamptz)','f80b00a498566140c9c8cf298da358eddce6796f5d823c8f72e7b482a41ec119',false,'sql','s','text',array['p_value']::text[],0,null::text,false),
  ('account_lifecycle_private.instant(text)','53e3ac52e33e3d36d227e7e013fbe925c22a199702c043d716a33c65ab63b69b',false,'plpgsql','s','timestamp with time zone',array['p_value']::text[],0,null::text,false),
  ('account_lifecycle_private.progress_valid(jsonb)','783337a691e9c0fd203b2fc3fc84f41827642585affbc6aa8b3869582a34d0d2',false,'sql','i','boolean',array['p_value']::text[],0,null::text,false),
  ('account_lifecycle_private.require_backend()','34c0951eb49984a916b4ff994226092d9134c1713f8c4850f60c03e5781c2eda',false,'plpgsql','v','void',array[]::text[],0,null::text,false),
  ('account_lifecycle_private.require_isolation()','d03063dc4bc92838e8ae3b4567895bb7d4fe691c19ae32928eb394af93677d62',false,'plpgsql','v','void',array[]::text[],0,null::text,false),
  ('account_lifecycle_private.initial_progress()','4a6f8073f088e8705b734037b917132c5eeb38d81a8ed4419603575a8ec94883',false,'sql','i','jsonb',array[]::text[],0,null::text,false),
  ('account_lifecycle_private.unavailable(text)','01509fd25513d5e71b9328939583e5fc5a6ee20a3af1fea27b9191895feb63e8',false,'sql','s','jsonb',array['p_reason']::text[],0,null::text,false),
  ('account_lifecycle_private.project(account_lifecycle_private.operations)','eac37338fff609204c6e6adc4bad7aadf57749c01599561f2eecb659935ba16b',false,'sql','s','jsonb',array['p_row']::text[],0,null::text,false),
  ('account_lifecycle_private.open_frame(uuid)','66a81c24be81a050649c67b8ed48b68674439a2e7756bba6beca27f35fde6542',true,'plpgsql','v','void',array['p_operation']::text[],0,null::text,false),
  ('account_lifecycle_private.close_frame(uuid)','14860e94e034fcf1bbb7b1b7e765b0e1e68cd64a34e71e3af913fe056011cebe',true,'plpgsql','v','void',array['p_operation']::text[],0,null::text,false),
  ('account_lifecycle_private.frame_valid(uuid)','304bd3269ca369bdb0660404d6e98b0a3d1d5d36bb9a3e0fcc4c3c944315016d',true,'sql','v','boolean',array['p_operation']::text[],0,null::text,false),
  ('account_lifecycle_private.ticket_must_close()','159d5cc529d58af28c14c5bc08cc12a659bdc3dbdf0bcd1d75e82bda7eea1b01',true,'plpgsql','v','trigger',array[]::text[],0,null::text,false),
  ('account_lifecycle_private.state_valid(account_lifecycle_private.operations)','dcffef95d18d83609d9f3811ebc2cd2cd574f8cb63af384e9e5f002faab6c82b',false,'plpgsql','i','boolean',array['p_row']::text[],0,null::text,false),
  ('account_lifecycle_private.operation_guard()','0e114773dca02e1ce0c6ab0f735225c39821ecba554024e312e2d12ad06587f7',true,'plpgsql','v','trigger',array[]::text[],0,null::text,false),
  ('account_lifecycle_private.subject_guard()','c07647c0bfec05d5c53825ec86bf8a76d22fb1f6382bf54da7d2d953e7cec9cf',true,'plpgsql','v','trigger',array[]::text[],0,null::text,false),
  ('account_lifecycle_private.event_guard()','8039355a6037a03aec61ce3093bae5b234d4ff48db593f1ed76d2de97b9792a8',true,'plpgsql','v','trigger',array[]::text[],0,null::text,false),
  ('account_lifecycle_private.definition_pins_valid(jsonb)','91f56464a4737abd82a2a8742aee2a1cd0f644782f2bcc1ba7aa6389d39de075',true,'plpgsql','s','boolean',array['p_pins']::text[],0,null::text,false),
  ('account_lifecycle_private.required_ports_valid(jsonb,boolean)','77f799c965a3fb8cd1f592317c26d12508a2b1f5d793a9e30348e3ee0d9d2df2',true,'plpgsql','s','boolean',array['p_pins','p_provider']::text[],1,'false',false),
  ('account_lifecycle_private.ports_valid(boolean)','c63eb67f47a3f80f2de0a86345c869f11cf0a5cb37fb90686dca7d3acf98a87e',true,'sql','s','boolean',array['p_provider']::text[],1,'false',false),
  ('account_lifecycle_private.context_valid(jsonb,boolean)','7650924174649f7df612d8be9791bd183d2598bf11b1bd11f58ac13a98f90d14',false,'plpgsql','s','boolean',array['p_context','p_prepare']::text[],0,null::text,false),
  ('account_lifecycle_private.policy_valid(jsonb)','392ebbe874d26848ce85fe766ecb5b0c3c18f3b45d20325e76e7b9dfb7eac7c0',false,'plpgsql','s','boolean',array['p_value']::text[],0,null::text,false),
  ('account_lifecycle_private.coverage_valid(jsonb)','776b51aa3a5fb6342c478414eb1a2a0f2a877b8c9f4515680edc6b9bb6b875f0',false,'plpgsql','i','boolean',array['p_value']::text[],0,null::text,false),
  ('account_lifecycle_private.dependencies_valid(jsonb,uuid)','b181382b4b05d2b685305a2c0b9b12a522710c4e3d5f263ad3ebaccadfcb17b5',false,'plpgsql','i','boolean',array['p_value','p_target']::text[],0,null::text,false),
  ('account_lifecycle_private.auth_lock_capable()','8ccaa026ec84551677de82d7428d22d2bd835ace5ba78534e2ef397408ced85d',true,'sql','s','boolean',array[]::text[],0,null::text,false),
  ('account_lifecycle_private.lock_operation(uuid,uuid,boolean)','108286c8802a6355e86a05fc4b6a293671a00be3b067e3df94b621cb8369b092',true,'plpgsql','v','void',array['p_actor','p_target','p_missing_target']::text[],1,'false',false),
  ('account_lifecycle_private.authority_result(uuid,uuid,text,text,uuid,jsonb,text,timestamptz)','7bea80b50978d7646e417cb18abef45c58152ce5d16c61b2a721e39921aefa66',true,'plpgsql','v','jsonb',array['p_actor','p_target','p_mode','p_phase','p_attempt','p_context','p_policy','p_cap']::text[],0,null::text,false),
  ('account_lifecycle_private.bundle(uuid,uuid,text,text,uuid,jsonb,timestamptz)','ce96d841e5406fb3a76d1cb4824e1578d3fe65f49a4d703efa4e27c5ed16468b',true,'plpgsql','v','jsonb',array['p_actor','p_target','p_mode','p_phase','p_attempt','p_context','p_cap']::text[],0,null::text,false),
  ('account_lifecycle_private.closure_blockers(jsonb,jsonb)','8b7ac4659213794eab4e82842ce02dbf6b1b647ed4e13bb1a79be4aa2f25ab92',false,'plpgsql','i','text[]',array['p_dependencies','p_coverage']::text[],0,null::text,false),
  ('account_lifecycle_private.dispatch_blockers(jsonb,jsonb)','fc26bd269fbd3a741a13dfc3a40defe82611a83e09e12f323c234130a958ea93',true,'plpgsql','s','text[]',array['p_dependencies','p_coverage']::text[],0,null::text,false),
  ('account_lifecycle_private.record_event(uuid,text,jsonb)','6b41cc4e7414f29645dc555b28040465c90d8cef09092439e789648833a104ec',true,'plpgsql','v','void',array['p_operation','p_event','p_evidence']::text[],0,null::text,false),
  ('account_lifecycle_private.block_operation(uuid,text[])','4c0d63f6b25f78fcb5aef0d322903bae97ecd9bb9dc87f8a489916214664352c',true,'plpgsql','v','jsonb',array['p_operation','p_reasons']::text[],0,null::text,false),
  ('account_lifecycle_private.prepare(uuid,uuid,text,uuid,text,jsonb)','c00f459f0ca84e73f6eb99c7376751f84fce3f2f429c8b902332a5ca81252ee5',true,'plpgsql','v','jsonb',array['p_actor','p_target','p_mode','p_attempt','p_reason','p_context']::text[],0,null::text,false),
  ('account_lifecycle_private.confirm(uuid,uuid,text,bigint,jsonb,text)','c2ddc8865770912a8f8594d95a2118160c2079cff6472ce1b8bc4429ec4d13b1',true,'plpgsql','v','jsonb',array['p_actor','p_operation','p_preview_sha256','p_expected_version','p_context','p_mode']::text[],0,null::text,false),
  ('account_lifecycle_private.status(uuid,uuid,jsonb,text)','782be3ac51a9aec702f83847a0edac885511153f74da533156dd6713c3714b75',true,'plpgsql','v','jsonb',array['p_actor','p_operation','p_context','p_mode']::text[],0,null::text,false),
  ('account_lifecycle_private.guard_subject_after_auth(uuid)','a127ee4ae23897adbd72423e27ad1e73ea88ad9606e31b70ddfd532e19f7a893',true,'plpgsql','v','void',array['p_subject']::text[],0,null::text,false),
  ('account_lifecycle_private.access_state(uuid)','b640d0a44974bd0ed286d5b938ce0da97024b1f4e474825bb383c11445194921',true,'plpgsql','s','jsonb',array['p_subject']::text[],0,null::text,false),
  ('account_lifecycle_private.claim_auth_delete(uuid,bigint,uuid)','b3f108edd02020efba29182eab58dc87bd7f6fe491a0b9f931593aafed57d1b4',false,'plpgsql','v','jsonb',array['p_operation','p_expected_version','p_execution']::text[],0,null::text,false),
  ('account_lifecycle_private.finish_auth_delete(uuid,uuid,text,text)','258b62e08bf04e79421877a4c1e6991d093f44c0ed9a5030ce2877244b8ae90d',false,'plpgsql','v','jsonb',array['p_operation','p_execution','p_outcome','p_evidence_sha256']::text[],0,null::text,false),
  ('account_lifecycle_private.cleanup_eligible(uuid)','fdaf3e693240f766d51f17cf480311f9a650ea88ceab583989f880a17c611d46',true,'plpgsql','s','boolean',array['p_operation']::text[],0,null::text,false),
  ('public.account_lifecycle_prepare_self(uuid,uuid,jsonb)','4dde098811d4488efc39750e8426ea8bf63dae36a2be452b5f3b62b7a8bee9b6',true,'sql','v','jsonb',array['p_actor','p_attempt','p_context']::text[],0,null::text,true),
  ('public.account_lifecycle_prepare_admin(uuid,uuid,uuid,text,jsonb)','99329e9d96b742f9b0dab7de604c72dd806429211df548d138dbabce318ffd74',true,'sql','v','jsonb',array['p_actor','p_target','p_attempt','p_reason','p_context']::text[],0,null::text,true),
  ('public.account_lifecycle_confirm_self(uuid,uuid,text,bigint,jsonb)','e572b24b6e9d500c88471a814f4eff40eeff460ea3f1932fa14ba79c98758351',true,'sql','v','jsonb',array['p_actor','p_operation','p_preview_sha256','p_expected_version','p_context']::text[],0,null::text,true),
  ('public.account_lifecycle_confirm_admin(uuid,uuid,text,bigint,jsonb)','37574cba537161e9dfaf018cc66c01837b0e506216af9e88029a0ffe0bbecaa4',true,'sql','v','jsonb',array['p_actor','p_operation','p_preview_sha256','p_expected_version','p_context']::text[],0,null::text,true),
  ('public.account_lifecycle_status_self(uuid,uuid)','042e5e7af5f73498de0f862f001cf9d1c9a05a134b4ef76ed1522b8987955d98',true,'sql','v','jsonb',array['p_actor','p_operation']::text[],0,null::text,true),
  ('public.account_lifecycle_status_admin(uuid,uuid,jsonb)','57a3e4a6fde867e67bb05cb2d45a586c127d95408c2bc3fbe7955fe901e15dba',true,'sql','v','jsonb',array['p_actor','p_operation','p_context']::text[],0,null::text,true),
  ('public.account_lifecycle_access_state(uuid)','0a2bc237f64a3b865b54862f4283be3c2ec3879507c15c5ffea92fee45db3352',true,'plpgsql','v','jsonb',array['p_subject']::text[],0,null::text,true),
  ('account_lifecycle_private.binding_guard()','1b593a15d44273413aff4c1eef8ecea760851a9a462a7c57ead93c58fbe7e594',true,'plpgsql','v','trigger',array[]::text[],0,null::text,false)
 ) v(signature,sha256,is_definer,language_name,volatility,result_type,argument_names,default_count,default_expression,is_public) loop
  select * into routine from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure(item.signature);
  if not found then return false;end if;
  actual:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(routine.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex');
  if actual is distinct from item.sha256 or pg_catalog.pg_get_userbyid(routine.proowner)<>'postgres'
   or routine.prosecdef is distinct from item.is_definer or routine.prokind<>'f' or routine.proretset
   or routine.provolatile::text<>item.volatility or pg_catalog.pg_get_function_result(routine.oid)<>item.result_type
   or (select lanname from pg_catalog.pg_language where oid=routine.prolang)<>item.language_name
   or coalesce(routine.proargnames,array[]::text[]) is distinct from item.argument_names or routine.pronargdefaults<>item.default_count
   or pg_catalog.pg_get_expr(routine.proargdefaults,0) is distinct from item.default_expression
   or routine.proconfig is null or routine.proconfig not in (array['search_path=""']::text[],array['search_path=']::text[])
   or exists(select 1 from pg_catalog.aclexplode(coalesce(routine.proacl,pg_catalog.acldefault('f',routine.proowner))) a
      where a.grantee<>routine.proowner and (not item.is_public or a.grantee<>'service_role'::regrole::oid or a.is_grantable))
   or pg_catalog.has_function_privilege('anon',routine.oid,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',routine.oid,'EXECUTE')
   or pg_catalog.has_function_privilege('service_role',routine.oid,'EXECUTE') is distinct from item.is_public then return false;end if;
  if exists(select 1 from pg_catalog.pg_proc shadow where shadow.pronamespace=routine.pronamespace
   and shadow.proname=routine.proname and shadow.oid<>routine.oid) then return false;end if;
 end loop;
 for item in select * from (values
  ('operations','account_lifecycle_operation_guard','account_lifecycle_private.operation_guard()',31,false),
  ('subject_state','account_lifecycle_subject_guard','account_lifecycle_private.subject_guard()',31,false),
  ('events','account_lifecycle_event_guard','account_lifecycle_private.event_guard()',31,false),
  ('bindings','account_lifecycle_binding_guard','account_lifecycle_private.binding_guard()',23,false),
  ('mutation_tickets','account_lifecycle_ticket_must_close','account_lifecycle_private.ticket_must_close()',5,true)
 ) v(table_name,trigger_name,function_name,type_bits,deferred) loop
  if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=pg_catalog.to_regclass('account_lifecycle_private.'||item.table_name)
   and t.tgname=item.trigger_name and t.tgfoid=pg_catalog.to_regprocedure(item.function_name) and t.tgtype::int=item.type_bits
   and t.tgenabled in ('O','A') and not t.tgisinternal and t.tgqual is null and t.tgnargs=0 and t.tgargs=pg_catalog.decode('','hex')
   and t.tgattr=''::pg_catalog.int2vector and t.tgdeferrable=item.deferred and t.tginitdeferred=item.deferred
   and t.tgconstrrelid=0 and t.tgconstrindid=0 and t.tgparentid=0 and t.tgoldtable is null and t.tgnewtable is null
   and ((not item.deferred and t.tgconstraint=0) or (item.deferred and exists(select 1 from pg_catalog.pg_constraint k
     where k.oid=t.tgconstraint and k.contype='t' and k.conrelid=t.tgrelid and k.conname=item.trigger_name)))) then return false;end if;
 end loop;
 for item in select value as name from pg_catalog.unnest(array['operations','subject_state','events','bindings','mutation_tickets']) value loop
  select * into relation from pg_catalog.pg_class where oid=pg_catalog.to_regclass('account_lifecycle_private.'||item.name);
  if not found then return false;end if;
  if relation.relkind<>'r' or relation.relpersistence<>'p' or relation.relispartition or not relation.relrowsecurity or not relation.relforcerowsecurity
   or pg_catalog.pg_get_userbyid(relation.relowner)<>'postgres'
   or exists(select 1 from pg_catalog.pg_inherits where inhrelid=relation.oid or inhparent=relation.oid)
   or exists(select 1 from pg_catalog.pg_policy where polrelid=relation.oid)
   or exists(select 1 from pg_catalog.aclexplode(coalesce(relation.relacl,pg_catalog.acldefault('r',relation.relowner))) a where a.grantee<>relation.relowner)
   or exists(select 1 from pg_catalog.pg_attribute where attrelid=relation.oid and attnum>0 and attacl is not null) then return false;end if;
 end loop;
 if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('S',c.relowner))) a
  where n.nspname='account_lifecycle_private' and c.relkind='S' and a.grantee<>c.relowner) then return false;end if;
 return true;
end $$;

-- Close ONLY this new canonical lifecycle surface. No Auth/domain grants or
-- global default ACL changes. There are deliberately no service dispatch setters.
revoke all on all functions in schema account_lifecycle_private from public,anon,authenticated,service_role;
revoke all on function public.account_lifecycle_prepare_self(uuid,uuid,jsonb),
 public.account_lifecycle_prepare_admin(uuid,uuid,uuid,text,jsonb),
 public.account_lifecycle_confirm_self(uuid,uuid,text,bigint,jsonb),
 public.account_lifecycle_confirm_admin(uuid,uuid,text,bigint,jsonb),
 public.account_lifecycle_status_self(uuid,uuid),public.account_lifecycle_status_admin(uuid,uuid,jsonb),
 public.account_lifecycle_access_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.account_lifecycle_prepare_self(uuid,uuid,jsonb),
 public.account_lifecycle_prepare_admin(uuid,uuid,uuid,text,jsonb),
 public.account_lifecycle_confirm_self(uuid,uuid,text,bigint,jsonb),
 public.account_lifecycle_confirm_admin(uuid,uuid,text,bigint,jsonb),
 public.account_lifecycle_status_self(uuid,uuid),public.account_lifecycle_status_admin(uuid,uuid,jsonb),
 public.account_lifecycle_access_state(uuid) to service_role;
do $postflight$
begin
 if not account_lifecycle_private.native_guards_valid() then raise exception using errcode='55000',message='account_lifecycle_native_installation_mismatch';end if;
 if exists(select 1 from account_lifecycle_private.bindings where enabled or project_binding is not null or definition_pins<>'[]'::jsonb)
  or exists(select 1 from account_lifecycle_private.operations) or exists(select 1 from account_lifecycle_private.subject_state)
  or exists(select 1 from account_lifecycle_private.events) or exists(select 1 from account_lifecycle_private.mutation_tickets) then
  raise exception using errcode='55000',message='account_lifecycle_activation_or_rows_not_permitted';end if;
end $postflight$;
commit;
