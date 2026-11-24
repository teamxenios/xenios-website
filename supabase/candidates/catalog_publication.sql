-- PRIVATE UNAPPLIED CANDIDATE, PostgreSQL17. Native qualification is UNRUN.
-- Installation/ACL/platform compatibility requires Root selection and review.
-- No product/content/media/price row is created, edited or auto-approved here.
begin;

create function public.research_catalog_publication_key(p jsonb)
returns text language plpgsql immutable set search_path=pg_catalog as $$
begin
  if p is null or jsonb_typeof(p) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p)) <> 4
     or not (p ?& array['offeringId','offeringVariantId','productId','variantId'])
     or coalesce(p->>'offeringId','') !~ '^mo_[0-9a-f]{1,97}$'
     or coalesce(p->>'offeringVariantId','') !~ '^mov_[0-9a-f]{1,96}$'
     or coalesce(p->>'productId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p->>'variantId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or p->>'productId' = '00000000-0000-0000-0000-000000000000'
     or p->>'variantId' = '00000000-0000-0000-0000-000000000000' then
    raise exception 'publication_invalid_identity';
  end if;
  return (p->>'offeringId')||'|'||(p->>'offeringVariantId')||'|'||(p->>'productId')||'|'||(p->>'variantId');
end; $$;

create function public.research_catalog_publication_hash(p jsonb)
returns text language sql immutable strict set search_path=pg_catalog
as $$ select encode(sha256(convert_to(p::text,'UTF8')),'hex') $$;

-- Same backend-only boundary used by the existing canonical account RPC:
-- service role must not accidentally carry an end-user subject/session.
create function public.research_catalog_publication_backend_only()
returns void language plpgsql stable set search_path=pg_catalog as $$
begin
  if current_setting('role',true) is distinct from 'service_role' or auth.uid() is not null then
    raise exception using errcode='42501',message='publication_backend_only';
  end if;
end; $$;

create table public.research_catalog_publication_revisions (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null,
  identity jsonb not null,
  product_id uuid not null references public.research_products(id),
  variant_id uuid not null,
  snapshot jsonb not null,
  evidence jsonb not null,
  created_by text not null check(length(created_by) between 1 and 320),
  created_at timestamptz not null default now(),
  foreign key(product_id,variant_id) references public.research_product_variants(product_id,id),
  check(identity_key=public.research_catalog_publication_key(identity)),
  check(product_id::text=identity->>'productId' and variant_id::text=identity->>'variantId'),
  check(jsonb_typeof(snapshot)='object' and jsonb_typeof(evidence)='object')
);
create table public.research_catalog_publication_heads (
  identity_key text primary key,
  identity jsonb not null,
  generation bigint not null default 0 check(generation between 0 and 9007199254740991),
  current_revision uuid references public.research_catalog_publication_revisions(id),
  updated_at timestamptz not null default now(),
  check(identity_key=public.research_catalog_publication_key(identity))
);
create table public.research_catalog_publication_operations (
  actor text not null check(length(actor) between 1 and 320),
  operation_key text not null check(length(operation_key) between 1 and 200),
  intent jsonb not null,
  intent_sha256 text not null check(intent_sha256 ~ '^[0-9a-f]{64}$'),
  identity_key text not null,
  operation text not null check(operation in ('seal','publish','withdraw','rollback')),
  receipt jsonb not null,
  accepted_at timestamptz not null default now(),
  primary key(actor,operation_key)
);
create index research_catalog_publication_history
  on public.research_catalog_publication_operations(identity_key,accepted_at);

create function public.research_catalog_publication_append_only()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'publication_history_immutable'; end; $$;
create trigger research_catalog_publication_revisions_immutable before update or delete
  on public.research_catalog_publication_revisions for each row
  execute function public.research_catalog_publication_append_only();
create trigger research_catalog_publication_operations_immutable before update or delete
  on public.research_catalog_publication_operations for each row
  execute function public.research_catalog_publication_append_only();

-- Existing canonical rows, not a second product/content/media authority. Draft
-- copy is NOT approved by this read: the server must resolve actual approval
-- evidence for this exact source hash before the separate seal command.
create function public.research_catalog_publication_source(p_identity jsonb,p_media_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.research_products%rowtype; v public.research_product_variants%rowtype;
        m public.research_product_media%rowtype; c jsonb; result jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  perform public.research_catalog_publication_key(p_identity);
  select * into p from public.research_products where id=(p_identity->>'productId')::uuid;
  select * into v from public.research_product_variants where id=(p_identity->>'variantId')::uuid and product_id=p.id;
  select * into m from public.research_product_media where id=p_media_id and product_id=p.id;
  if p.id is null or v.id is null or m.id is null or not p.active_state
     or p.admin_status <> 'published' or p.visibility_state <> 'public'
     or not v.active or v.status <> 'approved' or m.state <> 'approved'
     or nullif(trim(m.approved_by),'') is null or m.approved_at is null then
    raise exception 'publication_source_unavailable';
  end if;
  select jsonb_strip_nulls(jsonb_build_object(
    'summary',max(body) filter(where section='shortDescription'),
    'overview',coalesce(max(body) filter(where section='overview'),max(body) filter(where section='longDescription')),
    'storage',max(body) filter(where section='storageInformation'))) into c
  from public.research_product_content where product_id=p.id;
  if coalesce(length(c->>'summary'),0) not between 1 and 20000
     or coalesce(length(c->>'overview'),0) not between 1 and 20000
     or coalesce(length(c->>'storage'),0)>20000 then raise exception 'publication_content_unavailable'; end if;
  result:=jsonb_build_object('identity',p_identity,'productVersion',p.version,'variantVersion',v.version,
    'content',c,'contentSha256',public.research_catalog_publication_hash(c),
    'media',jsonb_build_object('id',m.id,'version',m.version,'contentType',m.content_type,
      'sizeBytes',m.size_bytes,'altText',m.alt_text,
      'storageIdentitySha256',encode(sha256(convert_to(m.storage_key,'UTF8')),'hex')));
  return result||jsonb_build_object('sourceSha256',public.research_catalog_publication_hash(result));
end; $$;

create function public.research_catalog_publication_replay(p_actor text,p_key text,p_intent jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare old public.research_catalog_publication_operations%rowtype;
begin
  perform public.research_catalog_publication_backend_only();
  select * into old from public.research_catalog_publication_operations where actor=p_actor and operation_key=p_key;
  if not found then return null; end if;
  if old.intent is distinct from p_intent or old.intent_sha256<>public.research_catalog_publication_hash(p_intent) then
    raise exception 'publication_idempotency_conflict';
  end if;
  return old.receipt||jsonb_build_object('replayed',true);
end; $$;

create function public.research_catalog_publication_revision(p_identity jsonb,p_revision_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform public.research_catalog_publication_backend_only();
 return (select jsonb_build_object('id',r.id,'identity',r.identity,'snapshot',r.snapshot,'evidence',r.evidence)
   from public.research_catalog_publication_revisions r
   where r.id=p_revision_id and r.identity_key=public.research_catalog_publication_key(p_identity));
end;
$$;

create function public.research_catalog_publication_current(p_identity jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare h public.research_catalog_publication_heads%rowtype; r jsonb; m public.research_product_media%rowtype;
begin
  perform public.research_catalog_publication_backend_only();
  select * into h from public.research_catalog_publication_heads where identity_key=public.research_catalog_publication_key(p_identity);
  if not found then return jsonb_build_object('generation',0,'revision',null); end if;
  if h.current_revision is null then return jsonb_build_object('generation',h.generation,'revision',null); end if;
  r:=public.research_catalog_publication_revision(p_identity,h.current_revision);
  -- Ordinary draft copy edits do not rewrite or invalidate the selected
  -- immutable published copy. Structural identity/media changes do refuse.
  if r is null or not exists(select 1 from public.research_products p join public.research_product_variants v on v.product_id=p.id
    where p.id=(p_identity->>'productId')::uuid and v.id=(p_identity->>'variantId')::uuid
      and p.active_state and p.admin_status='published' and p.visibility_state='public'
      and v.active and v.status='approved' and v.version=(r#>>'{snapshot,variantVersion}')::integer) then
    return jsonb_build_object('generation',h.generation,'revision',null);
  end if;
  select * into m from public.research_product_media where id=(r#>>'{snapshot,media,id}')::uuid
    and product_id=(p_identity->>'productId')::uuid;
  if m.id is null or m.state<>'approved' or nullif(trim(m.approved_by),'') is null or m.approved_at is null
     or m.version<>(r#>>'{snapshot,media,version}')::integer
     or encode(sha256(convert_to(m.storage_key,'UTF8')),'hex')<>r#>>'{snapshot,media,storageIdentitySha256}' then
    return jsonb_build_object('generation',h.generation,'revision',null);
  end if;
  return jsonb_build_object('generation',h.generation,'revision',r);
end; $$;

create function public.research_catalog_publication_seal(p_actor text,p_key text,p_intent jsonb,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare subject_identity jsonb:=p_intent->'identity'; k text; h public.research_catalog_publication_heads%rowtype;
        s jsonb; replay jsonb; rev uuid:=gen_random_uuid(); receipt jsonb;
begin
  perform public.research_catalog_publication_backend_only();
  k:=public.research_catalog_publication_key(subject_identity);
  if p_actor is null or length(trim(p_actor)) not between 1 and 320 or p_key is null
     or length(trim(p_key)) not between 1 and 200 or p_intent->>'operation' is distinct from 'seal'
     or jsonb_typeof(p_intent->'expectedGeneration') is distinct from 'number'
     or coalesce(p_intent->>'expectedGeneration','') !~ '^(0|[1-9][0-9]{0,15})$'
     or (p_intent->>'expectedGeneration')::numeric>9007199254740991 then
    raise exception 'publication_invalid_command'; end if;
  -- Actor/key lock precedes the exact head lock in BOTH command functions.
  perform pg_advisory_xact_lock(hashtextextended(p_actor||':'||p_key,0));
  replay:=public.research_catalog_publication_replay(p_actor,p_key,p_intent);if replay is not null then return replay; end if;
  insert into public.research_catalog_publication_heads(identity_key,identity) values(k,subject_identity) on conflict do nothing;
  select * into h from public.research_catalog_publication_heads where identity_key=k for update;
  if h.generation<>(p_intent->>'expectedGeneration')::bigint then raise exception 'publication_generation_conflict'; end if;
  -- Lock canonical mutation rows before building/validating the source again.
  perform 1 from public.research_products p where p.id=(subject_identity->>'productId')::uuid for update;
  perform 1 from public.research_product_variants v where v.id=(subject_identity->>'variantId')::uuid and v.product_id=(subject_identity->>'productId')::uuid for update;
  perform 1 from public.research_product_content c where c.product_id=(subject_identity->>'productId')::uuid order by c.section for update;
  perform 1 from public.research_product_media m where m.id=(p_intent->>'mediaId')::uuid and m.product_id=(subject_identity->>'productId')::uuid for update;
  s:=public.research_catalog_publication_source(subject_identity,(p_intent->>'mediaId')::uuid);
  if s->>'sourceSha256' is distinct from p_intent->>'sourceSha256' then raise exception 'publication_source_version_conflict'; end if;
  if p_evidence->'identity' is distinct from subject_identity or p_evidence->>'sourceSha256' is distinct from s->>'sourceSha256'
     or p_evidence->>'contentSha256' is distinct from s->>'contentSha256'
     or p_evidence->>'mediaId' is distinct from s#>>'{media,id}'
     or p_evidence->>'mediaVersion' is distinct from s#>>'{media,version}'
     or p_evidence->>'state' is distinct from 'approved' or p_evidence->>'usage' is distinct from 'public_catalog_display'
     or coalesce(p_evidence->>'contentApprovalSha256','') !~ '^[0-9a-f]{64}$'
     or coalesce(p_evidence->>'rightsApprovalSha256','') !~ '^[0-9a-f]{64}$'
     or coalesce(p_evidence->>'mediaSha256','') !~ '^[0-9a-f]{64}$'
     or coalesce((p_evidence->>'width')::integer,0) not between 1 and 20000
     or coalesce((p_evidence->>'height')::integer,0) not between 1 and 20000
     or coalesce(p_evidence->>'representation','') not in ('proposed_carton','proposed_vial','catalog_reference')
     or jsonb_typeof(p_evidence->'packagingDesign') is distinct from 'boolean'
     or not(p_evidence ? 'expiresAt')
     or (p_evidence->>'expiresAt' is not null and (p_evidence->>'expiresAt')::timestamptz<=now()) then
    raise exception 'publication_approval_required'; end if;
  insert into public.research_catalog_publication_revisions(id,identity_key,identity,product_id,variant_id,snapshot,evidence,created_by)
    values(rev,k,subject_identity,(subject_identity->>'productId')::uuid,(subject_identity->>'variantId')::uuid,s,p_evidence,p_actor);
  receipt:=jsonb_build_object('operation','seal','revisionId',rev,'generation',h.generation,'identity',subject_identity,'replayed',false);
  insert into public.research_product_admin_audit(product_id,entity_type,entity_id,action,actor,detail,after_state)
    values((subject_identity->>'productId')::uuid,'content',rev,'catalog_revision_sealed',p_actor,'Immutable exact-variant revision; approval/rights evidence is retained.',receipt);
  insert into public.research_catalog_publication_operations(actor,operation_key,intent,intent_sha256,identity_key,operation,receipt)
    values(p_actor,p_key,p_intent,public.research_catalog_publication_hash(p_intent),k,'seal',receipt);
  return receipt;
end; $$;

create function public.research_catalog_publication_transition(p_actor text,p_key text,p_intent jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare subject_identity jsonb:=p_intent->'identity'; k text; h public.research_catalog_publication_heads%rowtype;
        target uuid; op text:=p_intent->>'operation'; replay jsonb; receipt jsonb; old_revision uuid;
begin
  perform public.research_catalog_publication_backend_only();
  k:=public.research_catalog_publication_key(subject_identity);
  if p_actor is null or length(trim(p_actor)) not between 1 and 320 or p_key is null
     or length(trim(p_key)) not between 1 and 200 or op is null or op not in ('publish','withdraw','rollback')
     or jsonb_typeof(p_intent->'expectedGeneration') is distinct from 'number'
     or coalesce(p_intent->>'expectedGeneration','') !~ '^(0|[1-9][0-9]{0,15})$'
     or (p_intent->>'expectedGeneration')::numeric>9007199254740991 then
    raise exception 'publication_invalid_command'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor||':'||p_key,0));
  replay:=public.research_catalog_publication_replay(p_actor,p_key,p_intent);if replay is not null then return replay; end if;
  select * into h from public.research_catalog_publication_heads where identity_key=k for update;
  if not found then raise exception 'publication_not_found'; end if;
  if h.generation<>(p_intent->>'expectedGeneration')::bigint then raise exception 'publication_generation_conflict'; end if;
  if op in ('withdraw','rollback') and coalesce(length(trim(p_intent->>'reason')),0) not between 1 and 1000 then raise exception 'publication_reason_required'; end if;
  old_revision:=h.current_revision;
  if op='withdraw' then
    if old_revision is null then raise exception 'publication_not_published'; end if;
    target:=null;
  else
    target:=(p_intent->>'revisionId')::uuid;
    if public.research_catalog_publication_revision(subject_identity,target) is null then raise exception 'publication_revision_mismatch'; end if;
    if target is not distinct from old_revision then raise exception 'publication_already_current'; end if;
    if op='rollback' and not exists(select 1 from public.research_catalog_publication_operations o
      where o.identity_key=k and o.operation in ('publish','rollback') and o.receipt->>'revisionId'=target::text) then
      raise exception 'publication_not_previously_published'; end if;
  end if;
  update public.research_catalog_publication_heads set current_revision=target,generation=generation+1,updated_at=now() where identity_key=k returning * into h;
  -- Re-read current canonical product/variant/media gates before accepting a
  -- selection. The application must ALSO revalidate real current review rights.
  if target is not null and public.research_catalog_publication_current(subject_identity)->'revision'='null'::jsonb then
    raise exception 'publication_source_unavailable'; end if;
  receipt:=jsonb_build_object('operation',op,'revisionId',target,'generation',h.generation,'identity',subject_identity,'replayed',false);
  insert into public.research_product_admin_audit(product_id,entity_type,entity_id,action,actor,detail,before_state,after_state)
    values((subject_identity->>'productId')::uuid,'content',target,'catalog_'||op,p_actor,p_intent->>'reason',jsonb_build_object('revisionId',old_revision,'generation',h.generation-1),receipt);
  insert into public.research_catalog_publication_operations(actor,operation_key,intent,intent_sha256,identity_key,operation,receipt)
    values(p_actor,p_key,p_intent,public.research_catalog_publication_hash(p_intent),k,op,receipt);
  return receipt;
end; $$;

alter table public.research_catalog_publication_revisions enable row level security;
alter table public.research_catalog_publication_revisions force row level security;
alter table public.research_catalog_publication_heads enable row level security;
alter table public.research_catalog_publication_heads force row level security;
alter table public.research_catalog_publication_operations enable row level security;
alter table public.research_catalog_publication_operations force row level security;
revoke all on table public.research_catalog_publication_revisions,public.research_catalog_publication_heads,
  public.research_catalog_publication_operations from public,anon,authenticated,service_role;
-- No direct table grant. Six server-only RPCs are the explicit storage boundary.
revoke all on function public.research_catalog_publication_key(jsonb),public.research_catalog_publication_hash(jsonb),
  public.research_catalog_publication_backend_only(),public.research_catalog_publication_append_only(),public.research_catalog_publication_source(jsonb,uuid),
  public.research_catalog_publication_replay(text,text,jsonb),public.research_catalog_publication_revision(jsonb,uuid),
  public.research_catalog_publication_current(jsonb),public.research_catalog_publication_seal(text,text,jsonb,jsonb),
  public.research_catalog_publication_transition(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_catalog_publication_source(jsonb,uuid),
  public.research_catalog_publication_replay(text,text,jsonb),public.research_catalog_publication_revision(jsonb,uuid),
  public.research_catalog_publication_current(jsonb),public.research_catalog_publication_seal(text,text,jsonb,jsonb),
  public.research_catalog_publication_transition(text,text,jsonb) to service_role;
commit;
