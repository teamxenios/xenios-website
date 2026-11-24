-- PRIVATE UNAPPLIED EXTENSION. Requires the frozen publication base candidate.
-- No owner, pilot, approval, product or media is seeded by this file.
begin;

-- Only the database-owner installation channel can record a verified owner.
-- The application service role has neither table DML nor execute on its issuer.
-- Zero capability rows is the installed default; this file grants nobody rights.
create table public.research_catalog_approval_owner_events (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  capability_id uuid not null,
  identity_key text not null,
  identity jsonb not null,
  actor text not null check(actor=trim(actor) and length(actor) between 1 and 320),
  decision text not null check(decision in ('grant','revoke')),
  expires_at timestamptz,
  authority_reference text not null check(length(trim(authority_reference)) between 1 and 512),
  recorded_at timestamptz not null default now(),
  check(identity_key=public.research_catalog_publication_key(identity)),
  check(decision<>'grant' or (expires_at is not null and isfinite(expires_at)))
);
create index research_catalog_approval_owner_lookup on public.research_catalog_approval_owner_events(identity_key,actor,sequence desc);
create trigger research_catalog_approval_owner_immutable before update or delete on public.research_catalog_approval_owner_events
for each row execute function public.research_catalog_publication_append_only();

create table public.research_catalog_approval_events (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null,
  identity jsonb not null,
  version bigint not null check(version between 1 and 9007199254740991),
  approval_id uuid not null,
  decision text not null check(decision in ('approved','revoked')),
  actor text not null,
  operation_key text not null,
  intent jsonb not null,
  intent_sha256 text not null,
  owner_event_id uuid not null references public.research_catalog_approval_owner_events(id),
  evidence jsonb,
  receipt jsonb not null,
  recorded_at timestamptz not null default now(),
  unique(identity_key,version),unique(actor,operation_key),
  check(identity_key=public.research_catalog_publication_key(identity)),
  check(intent_sha256 ~ '^[a-f0-9]{64}$'),
  check((decision='approved')=(evidence is not null))
);
create index research_catalog_approval_lookup on public.research_catalog_approval_events(identity_key,version desc);
create index research_catalog_approval_by_id on public.research_catalog_approval_events(approval_id,version desc);
create unique index research_catalog_approval_one_creation on public.research_catalog_approval_events(approval_id) where decision='approved';
create trigger research_catalog_approval_immutable before update or delete on public.research_catalog_approval_events
for each row execute function public.research_catalog_publication_append_only();
create index research_catalog_publication_published_revisions
  on public.research_catalog_publication_operations(identity_key,(receipt->>'revisionId')) where operation in ('publish','rollback');

create function public.research_catalog_record_approval_owner(p_identity jsonb,p_actor text,p_capability_id uuid,p_decision text,p_expires_at timestamptz,p_authority_reference text)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare k text:=public.research_catalog_publication_key(p_identity); last_event public.research_catalog_approval_owner_events%rowtype; event_id uuid;
begin
  -- SECURITY INVOKER, no service-role execute grant. The actual privileged
  -- Root installer must verify the named owner/pilot/evidence out of band.
  if current_setting('role',true) in ('service_role','anon','authenticated') then raise exception using errcode='42501',message='approval_owner_installer_only'; end if;
  if p_actor is null or p_actor<>trim(p_actor) or length(p_actor) not between 1 and 320 or p_capability_id is null
    or p_decision is null or p_decision not in ('grant','revoke') or p_authority_reference is null or length(trim(p_authority_reference)) not between 1 and 512 then raise exception 'publication_invalid_command'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-approval-owner:'||k,0));
  select * into last_event from public.research_catalog_approval_owner_events where identity_key=k and actor=p_actor order by sequence desc limit 1;
  if p_decision='grant' and (p_expires_at is null or not isfinite(p_expires_at) or p_expires_at<=now()) then raise exception 'publication_invalid_command'; end if;
  if p_decision='revoke' and (last_event.id is null or last_event.decision<>'grant' or last_event.capability_id<>p_capability_id) then raise exception 'publication_approval_owner_required'; end if;
  insert into public.research_catalog_approval_owner_events(capability_id,identity_key,identity,actor,decision,expires_at,authority_reference)
    values(p_capability_id,k,p_identity,p_actor,p_decision,p_expires_at,p_authority_reference) returning id into event_id;
  return event_id;
end; $$;
revoke all on function public.research_catalog_record_approval_owner(jsonb,text,uuid,text,timestamptz,text) from public,anon,authenticated,service_role;

create function public.research_catalog_approval_owner(p_actor text,p_identity jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare k text:=public.research_catalog_publication_key(p_identity); e public.research_catalog_approval_owner_events%rowtype;
begin
  perform public.research_catalog_publication_backend_only();
  select * into e from public.research_catalog_approval_owner_events where identity_key=k and actor=p_actor order by sequence desc limit 1;
  if e.id is null or e.decision<>'grant' or e.expires_at<=now() then return null; end if;
  return jsonb_build_object('capabilityId',e.capability_id,'grantEventId',e.id,'identity',e.identity,'actor',e.actor,'usage','public_catalog_display','expiresAt',e.expires_at);
end; $$;
revoke all on function public.research_catalog_approval_owner(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_approval_owner(text,jsonb) to service_role;

create function public.research_catalog_approval_replay(p_actor text,p_key text,p_intent jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare old public.research_catalog_approval_events%rowtype;
begin
  perform public.research_catalog_publication_backend_only();
  select * into old from public.research_catalog_approval_events where actor=p_actor and operation_key=p_key;
  if not found then return null; end if;
  if old.intent is distinct from p_intent then raise exception 'publication_idempotency_conflict'; end if;
  return old.receipt||jsonb_build_object('replayed',true);
end; $$;
revoke all on function public.research_catalog_approval_replay(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_approval_replay(text,text,jsonb) to service_role;

create function public.research_catalog_approval_for_source(p_identity jsonb,p_source_sha256 text,p_media_id uuid,p_media_version integer)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare k text:=public.research_catalog_publication_key(p_identity); e public.research_catalog_approval_events%rowtype; owner jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  select * into e from public.research_catalog_approval_events where identity_key=k and decision='approved'
    and evidence->>'sourceSha256'=p_source_sha256 and evidence->>'mediaId'=p_media_id::text
    and (evidence->>'mediaVersion')::integer=p_media_version order by version desc limit 1;
  if e.id is null or exists(select 1 from public.research_catalog_approval_events where identity_key=k and approval_id=e.approval_id and decision='revoked') then return null; end if;
  owner:=public.research_catalog_approval_owner(e.actor,p_identity);
  if owner is null or owner->>'grantEventId'<>e.owner_event_id::text or (e.evidence->>'expiresAt' is not null and (e.evidence->>'expiresAt')::timestamptz<=now()) then return null; end if;
  return e.evidence;
end; $$;
revoke all on function public.research_catalog_approval_for_source(jsonb,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_approval_for_source(jsonb,text,uuid,integer) to service_role;

create function public.research_catalog_approval_state(p_actor text,p_identity jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare k text:=public.research_catalog_publication_key(p_identity);
begin
  perform public.research_catalog_publication_backend_only();
  return (
    with latest as (
      select e.approval_id,e.decision,e.version from public.research_catalog_approval_events e where e.identity_key=k
        and not exists(select 1 from public.research_catalog_approval_events n where n.identity_key=k and n.approval_id=e.approval_id and n.version>e.version)
      order by e.version desc limit 51
    ), recent as (select * from latest order by version desc limit 50)
    select jsonb_build_object('identity',p_identity,'approvalVersion',coalesce((select max(version) from public.research_catalog_approval_events where identity_key=k),0),'ownerCapability',public.research_catalog_approval_owner(p_actor,p_identity),
      'approvals',coalesce((select jsonb_agg(jsonb_build_object('approvalId',r.approval_id,'recordedDecision',r.decision,'approvalVersion',r.version,'sourceSha256',a.evidence->>'sourceSha256','mediaId',a.evidence->>'mediaId','mediaVersion',a.evidence->'mediaVersion','mediaSha256',a.evidence->>'mediaSha256','expiresAt',a.evidence->'expiresAt') order by r.version desc)
        from recent r join public.research_catalog_approval_events a on a.identity_key=k and a.approval_id=r.approval_id and a.decision='approved'),'[]'::jsonb),
      'historyTruncated',(select count(*)>50 from latest))
  );
end; $$;
revoke all on function public.research_catalog_approval_state(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_approval_state(text,jsonb) to service_role;

create function public.research_catalog_approval_decide(p_actor text,p_key text,p_intent jsonb,p_media_sha256 text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare subject_identity jsonb:=p_intent->'identity'; k text:=public.research_catalog_publication_key(subject_identity); op text:=p_intent->>'operation'; old public.research_catalog_approval_events%rowtype;
  v bigint; owner jsonb; source jsonb; evidence jsonb; proof jsonb; approval uuid; result jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  if p_intent is null or jsonb_typeof(p_intent) is distinct from 'object' or op is null or p_actor is null or p_actor<>trim(p_actor) or length(p_actor) not between 1 and 320 or p_key is null or p_key<>trim(p_key) or length(p_key) not between 1 and 200
    or op not in ('approve','revoke') or jsonb_typeof(p_intent->'expectedApprovalVersion') is distinct from 'number'
    or (p_intent->>'expectedApprovalVersion') !~ '^[0-9]+$' then raise exception 'publication_invalid_command'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-approval-command:'||p_actor||'|'||p_key,0));
  select * into old from public.research_catalog_approval_events where actor=p_actor and operation_key=p_key;
  if found then if old.intent is distinct from p_intent then raise exception 'publication_idempotency_conflict'; end if;return old.receipt||jsonb_build_object('replayed',true);end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-approval:'||k,0));
  select coalesce(max(version),0) into v from public.research_catalog_approval_events where identity_key=k;
  if v<>(p_intent->>'expectedApprovalVersion')::bigint or v>=9007199254740991 then raise exception 'publication_approval_version_conflict'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-approval-owner:'||k,0));
  owner:=public.research_catalog_approval_owner(p_actor,subject_identity);if owner is null then raise exception 'publication_approval_owner_required'; end if;
  if op='approve' then
    if (select count(*) from jsonb_object_keys(p_intent))<>14 or not(p_intent ?& array['operation','identity','expectedApprovalVersion','mediaId','sourceSha256','expectedMediaSha256','contentApprovalReference','rightsEvidenceReference','expiresAt','width','height','representation','packagingDesign','usage'])
      or p_media_sha256 is null or p_media_sha256 !~ '^[a-f0-9]{64}$' or p_media_sha256 is distinct from p_intent->>'expectedMediaSha256' or p_intent->>'usage' is distinct from 'public_catalog_display'
      or length(trim(coalesce(p_intent->>'contentApprovalReference',''))) not between 1 and 512
      or length(trim(coalesce(p_intent->>'rightsEvidenceReference',''))) not between 1 and 512
      or jsonb_typeof(p_intent->'width') is distinct from 'number' or jsonb_typeof(p_intent->'height') is distinct from 'number'
      or (p_intent->>'width') !~ '^[0-9]+$' or (p_intent->>'height') !~ '^[0-9]+$'
      or (p_intent->>'width')::integer not between 1 and 20000 or (p_intent->>'height')::integer not between 1 and 20000
      or coalesce(p_intent->>'representation','') not in ('proposed_carton','proposed_vial','catalog_reference')
      or jsonb_typeof(p_intent->'packagingDesign') is distinct from 'boolean'
      or (p_intent->>'expiresAt' is not null and (not isfinite((p_intent->>'expiresAt')::timestamptz) or (p_intent->>'expiresAt')::timestamptz<=now())) then raise exception 'publication_invalid_command'; end if;
    -- These row locks match the existing seal ordering and protect native
    -- source validation while recording the immutable decision and audit.
    perform 1 from public.research_products where id=(subject_identity->>'productId')::uuid for update;
    perform 1 from public.research_product_variants where product_id=(subject_identity->>'productId')::uuid and id=(subject_identity->>'variantId')::uuid for update;
    perform 1 from public.research_product_media where product_id=(subject_identity->>'productId')::uuid and id=(p_intent->>'mediaId')::uuid for update;
    source:=public.research_catalog_publication_source(subject_identity,(p_intent->>'mediaId')::uuid);
    if source is null or source->>'sourceSha256' is distinct from p_intent->>'sourceSha256' then raise exception 'publication_source_version_conflict'; end if;
    approval:=gen_random_uuid();proof:=jsonb_build_object('identity',subject_identity,'sourceSha256',source->>'sourceSha256','contentSha256',source->>'contentSha256','mediaId',source#>>'{media,id}','mediaVersion',source#>'{media,version}','mediaSha256',p_media_sha256,'actor',p_actor,'ownerEventId',owner->>'grantEventId','usage','public_catalog_display','expiresAt',p_intent->'expiresAt','contentReference',p_intent->>'contentApprovalReference','rightsReference',p_intent->>'rightsEvidenceReference');
    evidence:=jsonb_build_object('identity',subject_identity,'sourceSha256',source->>'sourceSha256','contentSha256',source->>'contentSha256','mediaId',source#>>'{media,id}','mediaVersion',source#>'{media,version}','mediaSha256',p_media_sha256,'contentApprovalSha256',public.research_catalog_publication_hash(proof||jsonb_build_object('purpose','content')),'rightsApprovalSha256',public.research_catalog_publication_hash(proof||jsonb_build_object('purpose','rights')),'usage','public_catalog_display','state','approved','expiresAt',p_intent->'expiresAt','width',p_intent->'width','height',p_intent->'height','representation',p_intent->'representation','packagingDesign',p_intent->'packagingDesign');
  else
    if p_media_sha256 is not null then raise exception 'publication_invalid_command'; end if;
    if (select count(*) from jsonb_object_keys(p_intent))<>5 or not(p_intent ?& array['operation','identity','expectedApprovalVersion','approvalId','reason']) or length(trim(coalesce(p_intent->>'reason',''))) not between 1 and 1000 then raise exception 'publication_invalid_command'; end if;
    approval:=(p_intent->>'approvalId')::uuid;
    if not exists(select 1 from public.research_catalog_approval_events where identity_key=k and approval_id=approval and decision='approved') then raise exception 'publication_approval_not_found'; end if;
    if exists(select 1 from public.research_catalog_approval_events where identity_key=k and approval_id=approval and decision='revoked') then raise exception 'publication_approval_already_revoked'; end if;
  end if;
  result:=jsonb_build_object('operation',op,'identity',subject_identity,'approvalId',approval,'approvalVersion',v+1,'decision',case when op='approve' then 'approved' else 'revoked' end,'replayed',false);
  insert into public.research_catalog_approval_events(identity_key,identity,version,approval_id,decision,actor,operation_key,intent,intent_sha256,owner_event_id,evidence,receipt)
    values(k,subject_identity,v+1,approval,case when op='approve' then 'approved' else 'revoked' end,p_actor,p_key,p_intent,public.research_catalog_publication_hash(p_intent),(owner->>'grantEventId')::uuid,evidence,result);
  insert into public.research_product_admin_audit(product_id,entity_type,entity_id,action,actor,detail,after_state)
    values((subject_identity->>'productId')::uuid,'content',approval,'catalog_approval_'||op,p_actor,'Authorized exact-variant content and media evidence decision; private source references retained in immutable approval history.',result);
  return result;
end; $$;
revoke all on function public.research_catalog_approval_decide(text,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_approval_decide(text,text,jsonb,text) to service_role;

-- Bind existing publication transactions to the actual current approval under
-- the same owner-window lock used by approve/revoke and the native issuer.
-- The original source stays frozen; direct backend execution is replaced by
-- these checked entry points. Historical exact receipts remain recoverable.
create function public.research_catalog_publication_seal_verified(p_actor text,p_key text,p_intent jsonb,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare subject_identity jsonb:=p_intent->'identity'; k text:=public.research_catalog_publication_key(subject_identity); replay jsonb; approved jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  replay:=public.research_catalog_publication_replay(p_actor,p_key,p_intent);if replay is not null then return replay;end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-approval-owner:'||k,0));
  replay:=public.research_catalog_publication_replay(p_actor,p_key,p_intent);if replay is not null then return replay;end if;
  approved:=public.research_catalog_approval_for_source(subject_identity,p_intent->>'sourceSha256',(p_intent->>'mediaId')::uuid,(p_evidence->>'mediaVersion')::integer);
  if approved is null or approved is distinct from p_evidence then raise exception 'publication_approval_required';end if;
  return public.research_catalog_publication_seal(p_actor,p_key,p_intent,p_evidence);
end; $$;
revoke all on function public.research_catalog_publication_seal_verified(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_publication_seal_verified(text,text,jsonb,jsonb) to service_role;

create function public.research_catalog_publication_transition_verified(p_actor text,p_key text,p_intent jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare subject_identity jsonb:=p_intent->'identity'; k text:=public.research_catalog_publication_key(subject_identity); replay jsonb; r public.research_catalog_publication_revisions%rowtype; approved jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  replay:=public.research_catalog_publication_replay(p_actor,p_key,p_intent);if replay is not null then return replay;end if;
  if p_intent->>'operation'='withdraw' then return public.research_catalog_publication_transition(p_actor,p_key,p_intent);end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-approval-owner:'||k,0));
  replay:=public.research_catalog_publication_replay(p_actor,p_key,p_intent);if replay is not null then return replay;end if;
  select * into r from public.research_catalog_publication_revisions where identity_key=k and id=(p_intent->>'revisionId')::uuid;
  if not found then raise exception 'publication_revision_mismatch';end if;
  approved:=public.research_catalog_approval_for_source(subject_identity,r.snapshot->>'sourceSha256',(r.snapshot#>>'{media,id}')::uuid,(r.snapshot#>>'{media,version}')::integer);
  if approved is null or approved is distinct from r.evidence then raise exception 'publication_approval_required';end if;
  return public.research_catalog_publication_transition(p_actor,p_key,p_intent);
end; $$;
revoke all on function public.research_catalog_publication_transition_verified(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_publication_transition_verified(text,text,jsonb) to service_role;
revoke all on function public.research_catalog_publication_seal(text,text,jsonb,jsonb),public.research_catalog_publication_transition(text,text,jsonb) from public,anon,authenticated,service_role;

alter table public.research_catalog_approval_owner_events enable row level security;
alter table public.research_catalog_approval_owner_events force row level security;
alter table public.research_catalog_approval_events enable row level security;
alter table public.research_catalog_approval_events force row level security;
revoke all on public.research_catalog_approval_owner_events,public.research_catalog_approval_events from public,anon,authenticated,service_role;

-- One STABLE backend call uses one snapshot for head, immutable revisions and
-- committed operations. It never substitutes the public current-media filter.
create function public.research_catalog_publication_admin_state(p_actor text,p_identity jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare k text:=public.research_catalog_publication_key(p_identity); result jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  if p_actor is null or p_actor<>trim(p_actor) or length(p_actor) not between 1 and 320 then
    raise exception 'publication_invalid_command';
  end if;
  with head as (
    select h.generation,h.current_revision from public.research_catalog_publication_heads h where h.identity_key=k
  ), chosen as (
    select r.id,r.created_at from public.research_catalog_publication_revisions r where r.identity_key=k
    order by (r.id=(select current_revision from head)) desc nulls last,r.created_at desc,r.id desc limit 50
  ), recent as (
    select o.operation,o.receipt,o.accepted_at,o.actor,o.operation_key from public.research_catalog_publication_operations o where o.identity_key=k
    order by o.accepted_at desc,o.actor,o.operation_key limit 50
  )
  select jsonb_build_object(
    'identity',p_identity,
    'generation',coalesce((select generation from head),0),
    'currentRevisionId',(select current_revision from head),
    'revisions',coalesce((select jsonb_agg(jsonb_build_object('revisionId',c.id,'previouslyPublished',exists(
      select 1 from public.research_catalog_publication_operations o where o.identity_key=k and o.operation in ('publish','rollback') and o.receipt->>'revisionId'=c.id::text
    )) order by c.created_at desc,c.id desc) from chosen c),'[]'::jsonb),
    'operations',coalesce((select jsonb_agg(jsonb_build_object('operation',r.operation,'revisionId',r.receipt->'revisionId','generation',r.receipt->'generation','at',r.accepted_at) order by r.accepted_at desc,r.actor,r.operation_key) from recent r),'[]'::jsonb),
    'historyTruncated',(select count(*)>50 from (select 1 from public.research_catalog_publication_revisions where identity_key=k limit 51) bounded_revisions)
      or (select count(*)>50 from (select 1 from public.research_catalog_publication_operations where identity_key=k limit 51) bounded_operations)
  ) into result;
  return result;
end; $$;
revoke all on function public.research_catalog_publication_admin_state(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_publication_admin_state(text,jsonb) to service_role;

commit;
