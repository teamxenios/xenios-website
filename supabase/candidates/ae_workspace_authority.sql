-- SOURCE CANDIDATE ONLY. No managed migration, grant provisioning or activation.
-- Operational scopes are explicitly adopted UUIDs; they are NOT organization
-- memberships and do not refer to the legacy partner organization tables.
begin;
set local lock_timeout='5s';

create schema if not exists ae_workspace_private;
revoke all on schema ae_workspace_private from public,anon,authenticated,service_role;
grant usage on schema ae_workspace_private to service_role;

create table if not exists ae_workspace_private.settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  approved_by uuid references auth.users(id), approved_at timestamptz,
  privacy_policy_version text, retention_policy_version text,
  check(not enabled or (approved_by is not null and approved_at is not null
    and length(privacy_policy_version) between 1 and 200
    and length(retention_policy_version) between 1 and 200
    and privacy_policy_version is not null and retention_policy_version is not null))
);
insert into ae_workspace_private.settings(singleton) values(true) on conflict do nothing;

create table if not exists ae_workspace_private.grants (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id), scope_id uuid not null,
  revision bigint not null default 1 check(revision between 1 and 9007199254740991),
  capabilities text[] not null check(cardinality(capabilities) between 1 and 5
    and capabilities <@ array['workspace:read','customer:contact','followup:record','customer:reassign','customer:assign']::text[]),
  valid_from timestamptz not null, valid_until timestamptz not null,
  revoked_at timestamptz, require_aal2 boolean not null default true,
  approved_by uuid not null references auth.users(id), approved_at timestamptz not null,
  unique(actor_user_id,scope_id),
  check(isfinite(valid_from) and isfinite(valid_until) and valid_until>valid_from)
);
create table if not exists ae_workspace_private.assignments (
  id uuid primary key default gen_random_uuid(), scope_id uuid not null,
  customer_auth_user_id uuid not null unique references auth.users(id),
  assignee_auth_user_id uuid not null references auth.users(id),
  revision bigint not null check(revision between 1 and 9007199254740991)
);
create table if not exists ae_workspace_private.audit_events (
  id uuid primary key default gen_random_uuid(), actor_user_id uuid not null references auth.users(id),
  session_id uuid not null, scope_id uuid not null,
  customer_auth_user_id uuid references auth.users(id), assignment_id uuid references ae_workspace_private.assignments(id),
  kind text not null check(kind in ('workspace_read','contact_read','assignment_assigned','assignment_reassigned','followup_recorded','guest_claimed')),
  command_id uuid, occurred_at timestamptz not null default clock_timestamp(),
  transferred_followup_ids uuid[] not null default '{}'::uuid[] check(cardinality(transferred_followup_ids)<=100)
);
create table if not exists ae_workspace_private.assignment_events (
  id uuid primary key references ae_workspace_private.audit_events(id),
  assignment_id uuid not null references ae_workspace_private.assignments(id), scope_id uuid not null,
  customer_auth_user_id uuid not null references auth.users(id), revision bigint not null,
  actor_user_id uuid not null references auth.users(id), assignee_auth_user_id uuid not null references auth.users(id),
  previous_assignee_auth_user_id uuid references auth.users(id),
  kind text not null check(kind in ('assigned','reassigned')), occurred_at timestamptz not null,
  unique(assignment_id,revision),
  check((kind='assigned' and previous_assignee_auth_user_id is null and revision=1)
    or (kind='reassigned' and previous_assignee_auth_user_id is not null
      and previous_assignee_auth_user_id<>assignee_auth_user_id and revision>1))
);
create table if not exists ae_workspace_private.followups (
  id uuid primary key default gen_random_uuid(), customer_auth_user_id uuid not null references auth.users(id),
  assignment_id uuid not null references ae_workspace_private.assignments(id),
  owner_auth_user_id uuid not null references auth.users(id),
  purpose text not null check(purpose in ('contact_customer','request_status_followup','documentation_followup')),
  due_at timestamptz not null check(isfinite(due_at)), state text not null check(state in ('open','completed')),
  created_at timestamptz not null, created_audit_id uuid not null references ae_workspace_private.audit_events(id)
);
create table if not exists ae_workspace_private.guest_request_claims (
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique references request_intent_private.requests(id),
  customer_auth_user_id uuid not null references auth.users(id), member_id uuid not null,
  binding_id uuid not null references public.research_early_access_legal_bindings(id),
  guest_customer_ref text not null check(guest_customer_ref ~ '^eac_[a-f0-9]{32}$'),
  guest_owner_hash text not null check(guest_owner_hash ~ '^[a-f0-9]{64}$'),
  claimed_at timestamptz not null, audit_id uuid not null references ae_workspace_private.audit_events(id)
);
create table if not exists ae_workspace_private.command_receipts (
  actor_user_id uuid not null references auth.users(id), command_id uuid not null,
  scope_id uuid not null, payload jsonb not null check(jsonb_typeof(payload)='object'),
  receipt jsonb not null check(jsonb_typeof(receipt)='object'),
  audit_id uuid not null references ae_workspace_private.audit_events(id),
  primary key(actor_user_id,command_id)
);

create or replace function ae_workspace_private.immutable()
returns trigger language plpgsql set search_path='' as $$ begin
  raise exception using errcode='42501',message='ae_append_only';
end $$;
do $$ declare t text; begin
  foreach t in array array['audit_events','assignment_events','guest_request_claims','command_receipts'] loop
    execute format('drop trigger if exists ae_append_only on ae_workspace_private.%I',t);
    execute format('create trigger ae_append_only before update or delete on ae_workspace_private.%I for each row execute function ae_workspace_private.immutable()',t);
  end loop;
end $$;

create or replace function ae_workspace_private.instant(t timestamptz)
returns text language sql immutable strict set search_path='' as $$
  select to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;
create or replace function ae_workspace_private.member_owner_hash(u uuid)
returns text language sql immutable strict set search_path='' as $$
  select encode(sha256(convert_to('["request-intent-owner","member","'||u::text||'"]','UTF8')),'hex')
$$;
create or replace function ae_workspace_private.guest_owner_hash(c text,s text)
returns text language sql immutable strict set search_path='' as $$
  select encode(sha256(convert_to('["request-intent-owner","session",'||to_json(c)::text||','||to_json(s)::text||']','UTF8')),'hex')
$$;
create or replace function ae_workspace_private.backend()
returns void language plpgsql security invoker set search_path='' as $$ begin
  if current_setting('role',true) is distinct from 'service_role' or auth.uid() is not null then
    raise exception using errcode='42501',message='ae_backend_only';
  end if;
  perform 1 from ae_workspace_private.settings where singleton and enabled for share;
  if not found then raise exception using errcode='55000',message='ae_unavailable'; end if;
end $$;
create or replace function ae_workspace_private.session(p_actor uuid,p_session uuid,p_aal2 boolean)
returns void language plpgsql security invoker set search_path='' as $$ begin
  -- The request's ordinary purpose and JWT expiry are verified before RPC by
  -- canonical Auth. This additional row lock serializes sign-out/deletion and
  -- enforces the exact session/user binding and current stored assurance.
  perform 1 from auth.sessions where id=p_session and user_id=p_actor
    and (not_after is null or not_after>clock_timestamp()) and (not p_aal2 or aal='aal2') for share;
  if not found then raise exception using errcode='42501',message='ae_access_denied'; end if;
end $$;
create or replace function ae_workspace_private.authority(p_actor uuid,p_session uuid,p_scope uuid,p_capability text)
returns ae_workspace_private.grants language plpgsql security invoker set search_path='' as $$
declare g ae_workspace_private.grants;
begin
  perform ae_workspace_private.backend();
  select * into g from ae_workspace_private.grants where actor_user_id=p_actor and scope_id=p_scope for share;
  if not found or g.revoked_at is not null or not(p_capability=any(g.capabilities))
    or clock_timestamp()<g.valid_from or clock_timestamp()>=g.valid_until then
    raise exception using errcode='42501',message='ae_access_denied';
  end if;
  perform ae_workspace_private.session(p_actor,p_session,g.require_aal2);
  return g;
end $$;
create or replace function ae_workspace_private.authority_json(g ae_workspace_private.grants)
returns jsonb language sql stable strict set search_path='' as $$ select jsonb_build_object(
  'actorAuthUserId',g.actor_user_id,'scopeId',g.scope_id,'grantId',g.id,'grantRevision',g.revision,'active',g.revoked_at is null,
  'validFrom',ae_workspace_private.instant(g.valid_from),'validUntil',ae_workspace_private.instant(g.valid_until),'capabilities',to_jsonb(g.capabilities))
$$;
create or replace function ae_workspace_private.assignment_json(a ae_workspace_private.assignments)
returns jsonb language sql stable strict set search_path='' as $$ select jsonb_build_object(
  'id',a.id,'scopeId',a.scope_id,'customerAuthUserId',a.customer_auth_user_id,'assigneeAuthUserId',a.assignee_auth_user_id,'revision',a.revision)
$$;
create or replace function ae_workspace_private.followup_json(f ae_workspace_private.followups)
returns jsonb language sql stable strict set search_path='' as $$ select jsonb_build_object(
  'id',f.id,'customerAuthUserId',f.customer_auth_user_id,'assignmentId',f.assignment_id,'ownerAuthUserId',f.owner_auth_user_id,
  'purpose',f.purpose,'dueAt',ae_workspace_private.instant(f.due_at),'state',f.state,'createdAt',ae_workspace_private.instant(f.created_at))
$$;

-- Concrete scoped readers and commands are defined below. Every private table
-- and function is denied to application roles at the end of this candidate.

create or replace function ae_workspace_private.valid_claim(c ae_workspace_private.guest_request_claims)
returns boolean language sql stable strict set search_path='' as $$
  select exists(select 1 from request_intent_private.requests r
    join public.research_early_access_legal_bindings b on b.id=c.binding_id
    join public.research_members m on m.id=c.member_id and m.id=b.member_id
    where r.id=c.request_id and r.owner_hash=c.guest_owner_hash
      and m.auth_user_id=c.customer_auth_user_id and m.status='active'
      and b.established_by='verified_link' and b.attested_by is null
      and (b.customer_ref=c.guest_customer_ref or c.guest_customer_ref=any(b.alias_refs))
      and b.verified_at<=c.claimed_at)
$$;
create or replace function ae_workspace_private.current_assignment(p_actor uuid,p_scope uuid,p_customer uuid)
returns ae_workspace_private.assignments language plpgsql security invoker set search_path='' as $$
declare a ae_workspace_private.assignments;
begin
  select * into a from ae_workspace_private.assignments where customer_auth_user_id=p_customer
    and scope_id=p_scope and assignee_auth_user_id=p_actor for share;
  if not found then raise exception using errcode='P0002',message='ae_not_found'; end if;
  return a;
end $$;
create or replace function ae_workspace_private.read_snapshot(p_actor uuid,p_session uuid,p_scope uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g ae_workspace_private.grants; a ae_workspace_private.assignments; r request_intent_private.requests;
  customers jsonb:='[]'; requests jsonb; history jsonb; history_projection jsonb; tasks jsonb; contact jsonb; workflow jsonb;
  expected_hash text; count_value bigint; config_environment text;
begin
  g:=ae_workspace_private.authority(p_actor,p_session,p_scope,'workspace:read');
  select count(*) into count_value from ae_workspace_private.assignments
    where scope_id=p_scope and assignee_auth_user_id=p_actor;
  if count_value>500 then raise exception using errcode='55000',message='ae_paging_required'; end if;
  insert into ae_workspace_private.audit_events(actor_user_id,session_id,scope_id,kind)
    values(p_actor,p_session,p_scope,'workspace_read');
  for a in select * from ae_workspace_private.assignments where scope_id=p_scope and assignee_auth_user_id=p_actor
    order by customer_auth_user_id for share loop
    -- No guessed UUID mapping: require the exact canonical active member row.
    select count(*) into count_value from public.research_members
      where auth_user_id=a.customer_auth_user_id and status='active';
    if count_value<>1 then raise exception using errcode='55000',message='ae_identity_unavailable'; end if;
    expected_hash:=ae_workspace_private.member_owner_hash(a.customer_auth_user_id);
    requests:='[]'; contact:=null; count_value:=0;
    for r in select q.* from request_intent_private.requests q where q.owner_hash=expected_hash
      or exists(select 1 from ae_workspace_private.guest_request_claims c where c.request_id=q.id
        and c.customer_auth_user_id=a.customer_auth_user_id and ae_workspace_private.valid_claim(c))
      order by q.created_at,q.id loop
      count_value:=count_value+1;
      if count_value>100 then raise exception using errcode='55000',message='ae_paging_required'; end if;
      workflow:=null;
      if to_regprocedure('request_intent_private.workflow_projection(uuid)') is not null then
        execute 'select request_intent_private.workflow_projection($1)' into workflow using r.id;
      end if;
      requests:=requests||jsonb_build_array(jsonb_build_object('ownerHash',r.owner_hash,
        'receipt',request_intent_private.receipt(r),'workflow',workflow,
        'originalReferralInput',jsonb_build_object('requestId',r.id,'state','unavailable')));
      if 'customer:contact'=any(g.capabilities) then
        contact:=jsonb_build_object('customerAuthUserId',a.customer_auth_user_id,
          'displayName',r.contact->>'fullLegalName','email',r.contact->>'email','phone',r.contact->>'mobilePhone');
      end if;
    end loop;
    begin
      select count(*) into count_value from ae_workspace_private.assignment_events where assignment_id=a.id;
      if count_value>100 then
        history_projection:=jsonb_build_object('state','unavailable');
      else
        select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'assignmentId',e.assignment_id,'scopeId',e.scope_id,
          'customerAuthUserId',e.customer_auth_user_id,'revision',e.revision,'actorAuthUserId',e.actor_user_id,
          'assigneeAuthUserId',e.assignee_auth_user_id,'previousAssigneeAuthUserId',e.previous_assignee_auth_user_id,
          'kind',e.kind,'occurredAt',ae_workspace_private.instant(e.occurred_at)) order by e.revision),'[]')
          into history from ae_workspace_private.assignment_events e where e.assignment_id=a.id;
        history_projection:=jsonb_build_object('state','available','events',history);
      end if;
    exception when others then
      -- History is optional evidence, never an identity/permission fallback.
      -- The service withholds unprovable historical completed tasks and marks
      -- that customer's completeness; other customers and current tasks remain.
      history_projection:=jsonb_build_object('state','unavailable');
    end;
    select count(*) into count_value from ae_workspace_private.followups where assignment_id=a.id;
    if count_value>100 then raise exception using errcode='55000',message='ae_paging_required'; end if;
    select coalesce(jsonb_agg(ae_workspace_private.followup_json(f) order by f.created_at,f.id),'[]') into tasks
      from ae_workspace_private.followups f where f.assignment_id=a.id;
    if contact is not null then
      insert into ae_workspace_private.audit_events(actor_user_id,session_id,scope_id,customer_auth_user_id,assignment_id,kind)
        values(p_actor,p_session,p_scope,a.customer_auth_user_id,a.id,'contact_read');
    end if;
    customers:=customers||jsonb_build_array(jsonb_build_object('assignment',ae_workspace_private.assignment_json(a),
      'assignmentHistory',history_projection,'contact',contact,
      'referral',jsonb_build_object('state','unavailable'),'requests',requests,'followups',tasks));
  end loop;
  g:=ae_workspace_private.authority(p_actor,p_session,p_scope,'workspace:read');
  return jsonb_build_object('authority',ae_workspace_private.authority_json(g),'completeness','complete','customers',customers);
end $$;
create or replace function ae_workspace_private.authorize_customer(p_actor uuid,p_session uuid,p_scope uuid,p_customer uuid,p_capability text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g ae_workspace_private.grants; a ae_workspace_private.assignments; ids jsonb;
begin
  if p_capability not in ('followup:record','customer:reassign') then
    raise exception using errcode='22023',message='ae_invalid_input';
  end if;
  g:=ae_workspace_private.authority(p_actor,p_session,p_scope,p_capability);
  a:=ae_workspace_private.current_assignment(p_actor,p_scope,p_customer);
  select coalesce(jsonb_agg(id order by id),'[]') into ids from ae_workspace_private.followups
    where assignment_id=a.id and state='open';
  if jsonb_array_length(ids)>100 then raise exception using errcode='55000',message='ae_paging_required'; end if;
  return jsonb_build_object('authority',ae_workspace_private.authority_json(g),'assignment',ae_workspace_private.assignment_json(a),'openFollowupIds',ids);
end $$;
create or replace function ae_workspace_private.guest_ownership(p_actor uuid,p_session uuid,p_scope uuid,p_customer uuid,p_request uuid,p_owner_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g ae_workspace_private.grants; a ae_workspace_private.assignments; c ae_workspace_private.guest_request_claims;
begin
  g:=ae_workspace_private.authority(p_actor,p_session,p_scope,'workspace:read');
  a:=ae_workspace_private.current_assignment(p_actor,p_scope,p_customer);
  select * into c from ae_workspace_private.guest_request_claims where request_id=p_request
    and customer_auth_user_id=p_customer and guest_owner_hash=p_owner_hash;
  if not found or not ae_workspace_private.valid_claim(c) then return null; end if;
  insert into ae_workspace_private.audit_events(actor_user_id,session_id,scope_id,customer_auth_user_id,assignment_id,kind)
    values(p_actor,p_session,p_scope,p_customer,a.id,'workspace_read');
  return jsonb_build_object('claimId',c.id,'requestId',c.request_id,'customerAuthUserId',c.customer_auth_user_id,'ownerHash',c.guest_owner_hash);
end $$;

create or replace function ae_workspace_private.pin_grant_revision()
returns trigger language plpgsql set search_path='' as $$ begin
  if new.id<>old.id or new.actor_user_id<>old.actor_user_id or new.scope_id<>old.scope_id then
    raise exception using errcode='22023',message='ae_grant_identity_immutable';
  end if;
  if new is distinct from old then new.revision:=old.revision+1; end if;
  return new;
end $$;
drop trigger if exists ae_grant_revision on ae_workspace_private.grants;
create trigger ae_grant_revision before update on ae_workspace_private.grants
  for each row execute function ae_workspace_private.pin_grant_revision();

create or replace function ae_workspace_private.target_grant(p_target uuid,p_scope uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare g ae_workspace_private.grants;
begin
  select * into g from ae_workspace_private.grants where actor_user_id=p_target and scope_id=p_scope for share;
  if not found or g.revoked_at is not null or not('workspace:read'=any(g.capabilities))
    or clock_timestamp()<g.valid_from or clock_timestamp()>=g.valid_until then
    raise exception using errcode='42501',message='ae_target_unavailable';
  end if;
end $$;
create or replace function ae_workspace_private.audit_json(e ae_workspace_private.audit_events)
returns jsonb language sql stable strict set search_path='' as $$ select jsonb_build_object(
  'id',e.id,'commandId',e.command_id,'actorAuthUserId',e.actor_user_id,'assignmentId',e.assignment_id,
  'customerAuthUserId',e.customer_auth_user_id,'kind',e.kind,'occurredAt',ae_workspace_private.instant(e.occurred_at))
$$;
create or replace function ae_workspace_private.valid_receipt(p_receipt jsonb,p_payload jsonb,p_actor uuid,p_command uuid,p_scope uuid,p_audit uuid)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare e ae_workspace_private.audit_events; a ae_workspace_private.assignments; f ae_workspace_private.followups;
begin
  select * into e from ae_workspace_private.audit_events where id=p_audit;
  if not found or e.actor_user_id<>p_actor or e.command_id<>p_command or e.scope_id<>p_scope then return false; end if;
  if p_payload->>'operation'='claim' then
    return coalesce(request_intent_private.only_keys(p_receipt,array['requestId','claimId','replay'])
      and p_receipt ?& array['requestId','claimId','replay']
      and p_receipt->>'replay'='false'
      and exists(select 1 from ae_workspace_private.guest_request_claims c where c.audit_id=e.id
        and c.id=(p_receipt->>'claimId')::uuid and c.request_id=(p_receipt->>'requestId')::uuid
        and c.customer_auth_user_id=p_actor and ae_workspace_private.valid_claim(c)),false);
  end if;
  if (request_intent_private.only_keys(p_receipt,array['commandId','replay','assignment','followup','audit','followupTransfers'])
    and p_receipt ?& array['commandId','replay','assignment','followup','audit','followupTransfers']
    and p_receipt->>'commandId'=p_command::text and p_receipt->>'replay'='false'
    and p_receipt->'audit' is not distinct from ae_workspace_private.audit_json(e)) is not true then return false; end if;
  select * into a from ae_workspace_private.assignments where id=e.assignment_id;
  if not found or p_receipt->'assignment' is distinct from ae_workspace_private.assignment_json(a) then return false; end if;
  if e.kind='followup_recorded' then
    select * into f from ae_workspace_private.followups where created_audit_id=e.id;
    return coalesce(found and p_receipt->'followupTransfers'='[]'::jsonb
      and (p_receipt->'followup') - 'dueAt' = ae_workspace_private.followup_json(f) - 'dueAt'
      and (p_receipt->'followup'->>'dueAt')::timestamptz=f.due_at,false);
  end if;
  if e.kind not in ('assignment_assigned','assignment_reassigned') or p_receipt->'followup'<>'null'::jsonb
    or jsonb_typeof(p_receipt->'followupTransfers')<>'array'
    or jsonb_array_length(p_receipt->'followupTransfers')<>cardinality(e.transferred_followup_ids) then return false; end if;
  if exists(select 1 from jsonb_array_elements(p_receipt->'followupTransfers') t where
    (request_intent_private.only_keys(t,array['followupId','fromOwnerAuthUserId','toOwnerAuthUserId','auditId','occurredAt'])
    and t ?& array['followupId','fromOwnerAuthUserId','toOwnerAuthUserId','auditId','occurredAt']
    and (t->>'followupId')::uuid=any(e.transferred_followup_ids)
    and t->>'fromOwnerAuthUserId'=p_actor::text and t->>'toOwnerAuthUserId'=a.assignee_auth_user_id::text
    and t->>'auditId'=e.id::text and t->>'occurredAt'=ae_workspace_private.instant(e.occurred_at)) is not true) then return false; end if;
  if exists(select 1 from unnest(e.transferred_followup_ids) id where not exists(
    select 1 from jsonb_array_elements(p_receipt->'followupTransfers') t where t->>'followupId'=id::text)) then return false; end if;
  return true;
end $$;
alter table ae_workspace_private.command_receipts drop constraint if exists ae_receipt_consistent;
-- Validate the final INSERT row before COMMIT, not through a CHECK that queries
-- mutable current assignment/task state. Historical receipts remain immutable
-- and must survive later revisions, schema reapplication and restore.
create or replace function ae_workspace_private.validate_receipt_insert()
returns trigger language plpgsql security invoker set search_path='' as $$ begin
  if ae_workspace_private.valid_receipt(new.receipt,new.payload,new.actor_user_id,new.command_id,new.scope_id,new.audit_id) is not true then
    raise exception using errcode='23514',message='ae_invalid_receipt';
  end if;
  return null;
end $$;
drop trigger if exists ae_validate_receipt on ae_workspace_private.command_receipts;
create trigger ae_validate_receipt after insert on ae_workspace_private.command_receipts
  for each row execute function ae_workspace_private.validate_receipt_insert();

create or replace function ae_workspace_private.command(p_actor uuid,p_session uuid,p_scope uuid,p_command jsonb,p_grant uuid,p_grant_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g ae_workspace_private.grants; a ae_workspace_private.assignments; e ae_workspace_private.audit_events;
  f ae_workspace_private.followups; stored ae_workspace_private.command_receipts;
  operation text; capability text; v_command uuid; v_customer uuid; v_assignment uuid; next_id uuid; expected bigint; task_count bigint;
  payload jsonb; receipt jsonb; followup jsonb:='null'; transfers jsonb:='[]'; moved uuid[]:='{}'; task uuid; at_time timestamptz;
begin
  if jsonb_typeof(p_command) is distinct from 'object' then raise exception using errcode='22023',message='ae_invalid_input'; end if;
  operation:=p_command->>'kind';
  if operation='record_followup' then
    capability:='followup:record';
    if not request_intent_private.only_keys(p_command,array['kind','commandId','assignmentId','customerAuthUserId','expectedRevision','purpose','dueAt'])
      or p_command->>'purpose' is null or p_command->>'dueAt' is null
      or p_command->>'purpose' not in ('contact_customer','request_status_followup','documentation_followup')
      or not isfinite((p_command->>'dueAt')::timestamptz) then raise exception using errcode='22023',message='ae_invalid_input'; end if;
  elsif operation='reassign' then
    capability:='customer:reassign';
    if not request_intent_private.only_keys(p_command,array['kind','commandId','assignmentId','customerAuthUserId','expectedRevision','nextAssigneeAuthUserId']) then
      raise exception using errcode='22023',message='ae_invalid_input'; end if;
    next_id:=(p_command->>'nextAssigneeAuthUserId')::uuid;
    if next_id is null or next_id=p_actor then raise exception using errcode='22023',message='ae_invalid_input'; end if;
  else raise exception using errcode='22023',message='ae_invalid_input'; end if;
  v_command:=(p_command->>'commandId')::uuid; v_customer:=(p_command->>'customerAuthUserId')::uuid;
  v_assignment:=(p_command->>'assignmentId')::uuid; expected:=(p_command->>'expectedRevision')::bigint;
  if v_command is null or v_customer is null or v_assignment is null or expected is null or expected<1 or expected>=9007199254740991 then
    raise exception using errcode='22023',message='ae_invalid_input'; end if;
  g:=ae_workspace_private.authority(p_actor,p_session,p_scope,capability);
  if g.id is distinct from p_grant or g.revision is distinct from p_grant_revision then
    raise exception using errcode='42501',message='ae_access_denied'; end if;
  select * into a from ae_workspace_private.assignments where id=v_assignment and customer_auth_user_id=v_customer
    and scope_id=p_scope and assignee_auth_user_id=p_actor for update;
  if not found then raise exception using errcode='P0002',message='ae_not_found'; end if;
  -- Re-evaluate after a lock wait and BEFORE any receipt read. No former-AE
  -- receipt capability exists, even for an identical command after transfer.
  g:=ae_workspace_private.authority(p_actor,p_session,p_scope,capability);
  if g.id is distinct from p_grant or g.revision is distinct from p_grant_revision then
    raise exception using errcode='42501',message='ae_access_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||v_command::text,0));
  payload:=jsonb_build_object('operation','command','scopeId',p_scope,'command',p_command);
  select * into stored from ae_workspace_private.command_receipts cr where cr.actor_user_id=p_actor and cr.command_id=v_command;
  if found then
    if stored.payload is distinct from payload then raise exception using errcode='23505',message='ae_idempotency_conflict'; end if;
    return jsonb_build_object('authority',ae_workspace_private.authority_json(g),'receipt',jsonb_set(stored.receipt,'{replay}','true'));
  end if;
  if a.revision<>expected then raise exception using errcode='40001',message='ae_revision_conflict'; end if;
  if operation='record_followup' then
    -- The workspace reads ALL tasks, including completed history. Serialize the
    -- same readset bound under the assignment lock before any effect so a new
    -- task cannot make this customer's entire workspace unreadable. Exact replay
    -- stays above this check and still returns its recorded receipt at capacity.
    select count(*) into task_count from ae_workspace_private.followups where assignment_id=a.id;
    if task_count>=100 then raise exception using errcode='22023',message='ae_invalid_input'; end if;
  end if;
  if operation='reassign' then perform ae_workspace_private.target_grant(next_id,p_scope); end if;
  at_time:=clock_timestamp();
  if operation='reassign' then
    select coalesce(array_agg(id order by id),'{}') into moved from ae_workspace_private.followups where assignment_id=a.id and state='open';
    if cardinality(moved)>100 then raise exception using errcode='55000',message='ae_paging_required'; end if;
  end if;
  update ae_workspace_private.assignments set revision=revision+1,
    assignee_auth_user_id=case when operation='reassign' then next_id else p_actor end where id=a.id returning * into a;
  insert into ae_workspace_private.audit_events(actor_user_id,session_id,scope_id,customer_auth_user_id,assignment_id,kind,command_id,occurred_at,transferred_followup_ids)
    values(p_actor,p_session,p_scope,v_customer,a.id,case when operation='reassign' then 'assignment_reassigned' else 'followup_recorded' end,v_command,at_time,moved) returning * into e;
  if operation='record_followup' then
    insert into ae_workspace_private.followups(customer_auth_user_id,assignment_id,owner_auth_user_id,purpose,due_at,state,created_at,created_audit_id)
      values(v_customer,a.id,p_actor,p_command->>'purpose',(p_command->>'dueAt')::timestamptz,'open',at_time,e.id) returning * into f;
    followup:=jsonb_set(ae_workspace_private.followup_json(f),'{dueAt}',p_command->'dueAt');
  else
    insert into ae_workspace_private.assignment_events(id,assignment_id,scope_id,customer_auth_user_id,revision,actor_user_id,assignee_auth_user_id,previous_assignee_auth_user_id,kind,occurred_at)
      values(e.id,a.id,p_scope,v_customer,a.revision,p_actor,next_id,p_actor,'reassigned',at_time);
    update ae_workspace_private.followups set owner_auth_user_id=next_id where id=any(moved) and state='open';
    foreach task in array moved loop
      transfers:=transfers||jsonb_build_array(jsonb_build_object('followupId',task,'fromOwnerAuthUserId',p_actor,
        'toOwnerAuthUserId',next_id,'auditId',e.id,'occurredAt',ae_workspace_private.instant(at_time)));
    end loop;
    perform ae_workspace_private.target_grant(next_id,p_scope);
  end if;
  receipt:=jsonb_build_object('commandId',v_command,'replay',false,'assignment',ae_workspace_private.assignment_json(a),
    'followup',followup,'audit',ae_workspace_private.audit_json(e),'followupTransfers',transfers);
  insert into ae_workspace_private.command_receipts(actor_user_id,command_id,scope_id,payload,receipt,audit_id)
    values(p_actor,v_command,p_scope,payload,receipt,e.id);
  g:=ae_workspace_private.authority(p_actor,p_session,p_scope,capability);
  return jsonb_build_object('authority',ae_workspace_private.authority_json(g),'receipt',receipt);
end $$;

create or replace function ae_workspace_private.initial_assignment(p_actor uuid,p_session uuid,p_scope uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g ae_workspace_private.grants; a ae_workspace_private.assignments; e ae_workspace_private.audit_events;
  stored ae_workspace_private.command_receipts; v_command uuid; v_customer uuid; v_target uuid;
  payload jsonb; receipt jsonb; n bigint; at_time timestamptz;
begin
  g:=ae_workspace_private.authority(p_actor,p_session,p_scope,'customer:assign');
  if not request_intent_private.only_keys(p_command,array['commandId','customerAuthUserId','assigneeAuthUserId']) then
    raise exception using errcode='22023',message='ae_invalid_input'; end if;
  v_command:=(p_command->>'commandId')::uuid; v_customer:=(p_command->>'customerAuthUserId')::uuid;
  v_target:=(p_command->>'assigneeAuthUserId')::uuid;
  if v_command is null or v_customer is null or v_target is null then raise exception using errcode='22023',message='ae_invalid_input'; end if;
  select count(*) into n from public.research_members where auth_user_id=v_customer and status='active';
  if n<>1 then raise exception using errcode='P0002',message='ae_not_found'; end if;
  select * into a from ae_workspace_private.assignments where customer_auth_user_id=v_customer for update;
  if found and a.scope_id<>p_scope then raise exception using errcode='P0002',message='ae_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||v_command::text,0));
  payload:=jsonb_build_object('operation','assign','scopeId',p_scope,'command',p_command);
  select * into stored from ae_workspace_private.command_receipts cr where cr.actor_user_id=p_actor and cr.command_id=v_command;
  if found then
    if stored.payload is distinct from payload then raise exception using errcode='23505',message='ae_idempotency_conflict'; end if;
    g:=ae_workspace_private.authority(p_actor,p_session,p_scope,'customer:assign');
    return jsonb_build_object('authority',ae_workspace_private.authority_json(g),'receipt',jsonb_set(stored.receipt,'{replay}','true'));
  end if;
  if a.id is not null then raise exception using errcode='40001',message='ae_revision_conflict'; end if;
  perform ae_workspace_private.target_grant(v_target,p_scope);
  insert into ae_workspace_private.assignments(scope_id,customer_auth_user_id,assignee_auth_user_id,revision)
    values(p_scope,v_customer,v_target,1) on conflict(customer_auth_user_id) do nothing returning * into a;
  if not found then raise exception using errcode='40001',message='ae_revision_conflict'; end if;
  at_time:=clock_timestamp();
  insert into ae_workspace_private.audit_events(actor_user_id,session_id,scope_id,customer_auth_user_id,assignment_id,kind,command_id,occurred_at)
    values(p_actor,p_session,p_scope,v_customer,a.id,'assignment_assigned',v_command,at_time) returning * into e;
  insert into ae_workspace_private.assignment_events(id,assignment_id,scope_id,customer_auth_user_id,revision,actor_user_id,assignee_auth_user_id,previous_assignee_auth_user_id,kind,occurred_at)
    values(e.id,a.id,p_scope,v_customer,1,p_actor,v_target,null,'assigned',at_time);
  receipt:=jsonb_build_object('commandId',v_command,'replay',false,'assignment',ae_workspace_private.assignment_json(a),
    'followup','null'::jsonb,'audit',ae_workspace_private.audit_json(e),'followupTransfers','[]'::jsonb);
  insert into ae_workspace_private.command_receipts(actor_user_id,command_id,scope_id,payload,receipt,audit_id)
    values(p_actor,v_command,p_scope,payload,receipt,e.id);
  perform ae_workspace_private.target_grant(v_target,p_scope);
  g:=ae_workspace_private.authority(p_actor,p_session,p_scope,'customer:assign');
  return jsonb_build_object('authority',ae_workspace_private.authority_json(g),'receipt',receipt);
end $$;

create or replace function ae_workspace_private.claim_guest(p_actor uuid,p_session uuid,p_scope uuid,p_command jsonb,
  p_guest_ref text,p_guest_session_hash text,p_guest_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_command uuid; v_request uuid; members uuid[]; v_member uuid; b public.research_early_access_legal_bindings;
  c ae_workspace_private.guest_request_claims; e ae_workspace_private.audit_events; stored ae_workspace_private.command_receipts;
  payload jsonb; receipt jsonb; expected_hash text; at_time timestamptz;
begin
  perform ae_workspace_private.backend();
  perform ae_workspace_private.session(p_actor,p_session,false);
  if p_scope is null or not request_intent_private.only_keys(p_command,array['commandId','requestId']) then
    raise exception using errcode='22023',message='ae_invalid_input'; end if;
  v_command:=(p_command->>'commandId')::uuid; v_request:=(p_command->>'requestId')::uuid;
  if v_command is null or v_request is null then raise exception using errcode='22023',message='ae_invalid_input'; end if;
  select array_agg(id) into members from public.research_members where auth_user_id=p_actor and status='active';
  if coalesce(cardinality(members),0)<>1 then raise exception using errcode='42501',message='ae_access_denied'; end if;
  v_member:=members[1];
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||v_command::text,0));
  payload:=jsonb_build_object('operation','claim','scopeId',p_scope,'command',p_command);
  select * into stored from ae_workspace_private.command_receipts cr where cr.actor_user_id=p_actor and cr.command_id=v_command;
  if found then
    if stored.payload is distinct from payload then raise exception using errcode='23505',message='ae_idempotency_conflict'; end if;
    select * into c from ae_workspace_private.guest_request_claims where request_id=v_request and customer_auth_user_id=p_actor;
    if not found or not ae_workspace_private.valid_claim(c) then raise exception using errcode='P0002',message='ae_not_found'; end if;
    -- Durable canonical ownership authorizes this minimal exact receipt. No
    -- erased admission/session value is reconstructed for a new claim.
    return jsonb_set(stored.receipt,'{replay}','true');
  end if;
  if p_guest_ref is null or p_guest_ref !~ '^eac_[a-f0-9]{32}$'
    or p_guest_session_hash is null or p_guest_session_hash !~ '^[a-f0-9]{64}$'
    or p_guest_expires_at is null or not isfinite(p_guest_expires_at) or p_guest_expires_at<=clock_timestamp() then
    raise exception using errcode='P0002',message='ae_not_found'; end if;
  expected_hash:=ae_workspace_private.guest_owner_hash(p_guest_ref,p_guest_session_hash);
  perform 1 from request_intent_private.requests where id=v_request and owner_hash=expected_hash for share;
  if not found then raise exception using errcode='P0002',message='ae_not_found'; end if;
  select * into strict b from public.research_early_access_legal_bindings where member_id=v_member
    and (customer_ref=p_guest_ref or p_guest_ref=any(alias_refs))
    and established_by='verified_link' and attested_by is null and verified_at<=clock_timestamp() for share;
  at_time:=clock_timestamp();
  insert into ae_workspace_private.audit_events(actor_user_id,session_id,scope_id,customer_auth_user_id,kind,command_id,occurred_at)
    values(p_actor,p_session,p_scope,p_actor,'guest_claimed',v_command,at_time) returning * into e;
  insert into ae_workspace_private.guest_request_claims(request_id,customer_auth_user_id,member_id,binding_id,guest_customer_ref,guest_owner_hash,claimed_at,audit_id)
    values(v_request,p_actor,v_member,b.id,p_guest_ref,expected_hash,at_time,e.id)
    on conflict(request_id) do nothing returning * into c;
  if not found then raise exception using errcode='40001',message='ae_revision_conflict'; end if;
  receipt:=jsonb_build_object('requestId',v_request,'claimId',c.id,'replay',false);
  insert into ae_workspace_private.command_receipts(actor_user_id,command_id,scope_id,payload,receipt,audit_id)
    values(p_actor,v_command,p_scope,payload,receipt,e.id);
  perform ae_workspace_private.session(p_actor,p_session,false);
  return receipt;
end $$;

-- Explicit server-only wrappers. The service credential alone does not choose
-- a user: every call requires the verified request's exact actor/session pair.
create or replace function public.ae_workspace_read(p_actor_user_id uuid,p_session_id uuid,p_scope_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select ae_workspace_private.read_snapshot(p_actor_user_id,p_session_id,p_scope_id)
$$;
create or replace function public.ae_workspace_authorize(p_actor_user_id uuid,p_session_id uuid,p_scope_id uuid,p_customer_auth_user_id uuid,p_capability text)
returns jsonb language sql security invoker set search_path='' as $$
 select ae_workspace_private.authorize_customer(p_actor_user_id,p_session_id,p_scope_id,p_customer_auth_user_id,p_capability)
$$;
create or replace function public.ae_workspace_command(p_actor_user_id uuid,p_session_id uuid,p_scope_id uuid,p_command jsonb,p_grant_id uuid,p_grant_revision bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select ae_workspace_private.command(p_actor_user_id,p_session_id,p_scope_id,p_command,p_grant_id,p_grant_revision)
$$;
create or replace function public.ae_workspace_assign(p_actor_user_id uuid,p_session_id uuid,p_scope_id uuid,p_command jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select ae_workspace_private.initial_assignment(p_actor_user_id,p_session_id,p_scope_id,p_command)
$$;
create or replace function public.ae_workspace_guest_ownership(p_actor_user_id uuid,p_session_id uuid,p_scope_id uuid,p_customer_auth_user_id uuid,p_request_id uuid,p_owner_hash text)
returns jsonb language sql security invoker set search_path='' as $$
 select ae_workspace_private.guest_ownership(p_actor_user_id,p_session_id,p_scope_id,p_customer_auth_user_id,p_request_id,p_owner_hash)
$$;
create or replace function public.ae_workspace_claim(p_actor_user_id uuid,p_session_id uuid,p_scope_id uuid,p_command jsonb,p_guest_ref text,p_guest_session_hash text,p_guest_expires_at timestamptz)
returns jsonb language sql security invoker set search_path='' as $$
 select ae_workspace_private.claim_guest(p_actor_user_id,p_session_id,p_scope_id,p_command,p_guest_ref,p_guest_session_hash,p_guest_expires_at)
$$;

do $$ declare t text; f record; begin
  foreach t in array array['settings','grants','assignments','audit_events','assignment_events','followups','guest_request_claims','command_receipts'] loop
    execute format('alter table ae_workspace_private.%I enable row level security',t);
    execute format('revoke all on ae_workspace_private.%I from public,anon,authenticated,service_role',t);
  end loop;
  for f in select p.oid::regprocedure as signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ae_workspace_private' or (n.nspname='public' and p.proname in
      ('ae_workspace_read','ae_workspace_authorize','ae_workspace_command','ae_workspace_assign','ae_workspace_guest_ownership','ae_workspace_claim')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.nspname='public' or f.proname in ('read_snapshot','authorize_customer','command','initial_assignment','guest_ownership','claim_guest') then
      execute format('grant execute on function %s to service_role',f.signature);
    end if;
  end loop;
end $$;
commit;
