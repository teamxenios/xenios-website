-- SOURCE-ONLY CANDIDATE. NOT REGISTERED, EXECUTED OR QUALIFIED.
-- Authority: REVIEW_CLEARED_WRAPPER_CONTRACT_20261006.md at b75325a.
-- Metadata publication only. No writer guards, triggers, commit RPC or activation.
-- The owner can bypass its own ACLs; immutable means the callable surface never
-- updates/deletes a revision, not protection against a privileged administrator.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = '';

do $currentness_candidate$
declare
  installed integer;
  actual_fingerprint text;
  predecessor_fingerprint text;
  expected_definition text;
  seal text;
  expected_triggers constant jsonb := '[
    ["research_assisted_order_requests","research_assisted_order_paid_hold","O"],
    ["research_assisted_order_requests","hl12_observed_cancel","O"],
    ["research_assisted_order_requests","hl12_history_progression","O"],
    ["research_assisted_order_requests","aa_hl12_disposition_terminal","O"],
    ["research_assisted_order_requests","aaa_adp01_uncertainty","A"],
    ["research_assisted_order_requests","adp03_request_identity","A"],
    ["research_assisted_order_events","research_assisted_order_events_append_only","A"],
    ["research_assisted_order_events","research_assisted_order_paid_event_evidence","A"],
    ["research_assisted_order_events","hl12_disposition_cancel_event","O"],
    ["research_assisted_order_events","adp03_paid_event","A"],
    ["research_notification_outbox","hl12_payment_effects_outbox_guard","A"],
    ["research_notification_outbox","hl12_payment_effects_outbox_truncate","A"],
    ["research_notification_outbox","hl12_disposition_effects_outbox","O"],
    ["research_notification_outbox","hl12_disposition_effects_truncate","O"]
  ]'::jsonb;
  -- Exact catalog snapshot, including unknown overloads/relations in this slice's
  -- namespace. Does not seal the separately owned intake/replay/admin objects.
  fingerprint_sql text := $currentness_fingerprint$
with owned_relations as (
  select c.* from pg_catalog.pg_class c
  where c.relnamespace = 'public'::regnamespace
    and (c.relname like 'research\_health\_quick\_order\_authority\_%' escape '\'
      or c.relname like 'research\_health\_quick\_order\_currentness\_%' escape '\')
), owned_functions as (
  select p.* from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace
    and (p.proname in ('research_health_quick_order_publish_revision',
      'research_health_quick_order_revoke_revision','research_health_quick_order_read_current_authority')
      or p.proname like 'research\_health\_quick\_order\_currentness\_%' escape '\')
)
select encode(extensions.digest(convert_to(jsonb_build_object(
  'functions',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),
    p.proowner::regrole::text,p.proacl::text) order by p.oid::regprocedure::text) from owned_functions p),
  'relations',(select jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relpersistence,c.relrowsecurity,
    c.relforcerowsecurity,c.relowner::regrole::text,c.relacl::text,c.reloptions) order by c.relname) from owned_relations c),
  'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),
    a.attnotnull,a.attisdropped,a.attgenerated,a.attidentity,a.attcollation::regcollation::text,a.attacl::text,
    pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum)
    from owned_relations c join pg_attribute a on a.attrelid=c.oid and a.attnum>0
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum),
  'constraints',(select jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid,true),
    k.convalidated,k.condeferrable,k.condeferred) order by c.relname,k.conname)
    from owned_relations c join pg_constraint k on k.conrelid=c.oid),
  'indexes',(select jsonb_agg(jsonb_build_array(c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready)
    order by c.relname,i.indexrelid::regclass::text) from owned_relations c join pg_index i on i.indrelid=c.oid),
  'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_get_triggerdef(t.oid,true),t.tgenabled)
    order by c.relname,t.tgname) from owned_relations c join pg_trigger t on t.tgrelid=c.oid),
  'policies',(select jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname) from pg_policies p
    where p.schemaname='public' and p.tablename in(select relname from owned_relations)),
  'rules',(select jsonb_agg(jsonb_build_array(c.relname,r.rulename,pg_get_ruledef(r.oid),r.ev_enabled)
    order by c.relname,r.rulename) from owned_relations c join pg_rewrite r on r.ev_class=c.oid),
  'types',(select jsonb_agg(jsonb_build_array(t.typname,t.typtype,t.typowner::regrole::text,t.typacl::text)
    order by t.typname) from pg_type t where t.typnamespace='public'::regnamespace
    and (t.typname like 'research\_health\_quick\_order\_authority\_%' escape '\'
      or t.typname like 'research\_health\_quick\_order\_currentness\_%' escape '\'))
)::text,'UTF8'),'sha256'),'hex');
$currentness_fingerprint$;
  install_sql text := $currentness_install$
create function public.research_health_quick_order_currentness_valid_publication(p jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $publication_shape$
declare a jsonb; r jsonb; instant timestamptz; finish timestamptz; kinds text[] := '{}';
begin
  if p is null or jsonb_typeof(p)<>'object' or not p ?& array[
    'schemaVersion','revisionId','sourceCommit','bundleSha256','artifacts',
    'sourceRefs','applicabilityRefs','effectiveFrom','effectiveUntil']
    or p-array['schemaVersion','revisionId','sourceCommit','bundleSha256','artifacts',
      'sourceRefs','applicabilityRefs','effectiveFrom','effectiveUntil']<>'{}'::jsonb then return false; end if;
  if p->>'schemaVersion' is distinct from 'quick-order-authority-v1'
    or jsonb_typeof(p->'revisionId')<>'string' or p->>'revisionId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p->'sourceCommit')<>'string' or p->>'sourceCommit' !~ '^[0-9a-f]{40}$'
    or jsonb_typeof(p->'bundleSha256')<>'string' or p->>'bundleSha256' !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p->'effectiveFrom')<>'string'
    or p->>'effectiveFrom' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    or jsonb_typeof(p->'effectiveUntil') not in ('string','null') then return false; end if;
  instant := (p->>'effectiveFrom')::timestamptz;
  if to_char(instant at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p->>'effectiveFrom' then return false; end if;
  if p->'effectiveUntil'<>'null'::jsonb then
    if p->>'effectiveUntil' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then return false; end if;
    finish := (p->>'effectiveUntil')::timestamptz;
    if finish<=instant or to_char(finish at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p->>'effectiveUntil' then return false; end if;
  end if;
  if jsonb_typeof(p->'artifacts')<>'array' then return false; end if;
  if jsonb_array_length(p->'artifacts') not between 6 and 32 then return false; end if;
  for a in select value from jsonb_array_elements(p->'artifacts') loop
    if jsonb_typeof(a)<>'object' or not a ?& array['kind','path','sha256']
      or a-array['kind','path','sha256']<>'{}'::jsonb
      or jsonb_typeof(a->'kind')<>'string' or a->>'kind' not in
        ('catalog','bindings','reconciliation','health_legal','configuration','normalized_decision_inputs')
      or jsonb_typeof(a->'path')<>'string' or a->>'path' !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$'
      or a->>'path' ~ '(^|/)\.{1,2}(/|$)|//|/$'
      or jsonb_typeof(a->'sha256')<>'string' or a->>'sha256' !~ '^[0-9a-f]{64}$' then return false; end if;
    kinds := array_append(kinds,a->>'kind');
  end loop;
  if not kinds @> array['catalog','bindings','reconciliation','health_legal','configuration','normalized_decision_inputs']
    or (select count(*) from jsonb_array_elements(p->'artifacts')) <>
       (select count(distinct value->>'path') from jsonb_array_elements(p->'artifacts')) then return false; end if;
  -- Source/applicability references are opaque reviewed record IDs, never URLs,
  -- customer facts, authority decisions or executable paths. Actual bytes are
  -- bound by artifacts; SQL does not read or approve those artifacts.
  for r in select p->'sourceRefs' union all select p->'applicabilityRefs' loop
    if jsonb_typeof(r)<>'array' then return false; end if;
    if jsonb_array_length(r) not between 1 and 32 then return false; end if;
    for a in select value from jsonb_array_elements(r) loop
      if jsonb_typeof(a)<>'string' or a#>>'{}' !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$' then return false; end if;
    end loop;
    if jsonb_array_length(r)<>(select count(distinct value) from jsonb_array_elements(r)) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end
$publication_shape$;

create table public.research_health_quick_order_authority_revisions (
  revision_id uuid primary key,
  publication jsonb not null,
  published_at timestamptz not null default clock_timestamp(),
  published_by name not null default current_user,
  constraint research_health_quick_order_authority_revision_shape check
    (public.research_health_quick_order_currentness_valid_publication(publication)
      and revision_id=(publication->>'revisionId')::uuid)
);
create table public.research_health_quick_order_authority_head (
  singleton boolean primary key default true check(singleton),
  writer_epoch bigint not null default 0 check(writer_epoch>=0),
  state text not null default 'held' check(state in ('held','active')),
  -- Callable writers validate these references. No FK/internal trigger is
  -- installed in this explicitly trigger-free slice; owner DML is not trusted.
  active_revision_id uuid,
  last_published_revision_id uuid,
  last_revoked_revision_id uuid,
  last_revoke_reason text,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by name not null default current_user,
  constraint research_health_quick_order_authority_head_state check
    ((state='held' and active_revision_id is null) or (state='active' and active_revision_id is not null)),
  constraint research_health_quick_order_authority_head_revoke check
    ((last_revoked_revision_id is null and last_revoke_reason is null)
      or (last_revoked_revision_id is not null and last_revoke_reason ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'))
);
alter table public.research_health_quick_order_authority_revisions enable row level security;
alter table public.research_health_quick_order_authority_head enable row level security;
revoke all on public.research_health_quick_order_authority_revisions,
  public.research_health_quick_order_authority_head from public,anon,authenticated,service_role;

create function public.research_health_quick_order_currentness_integrity()
returns void language plpgsql stable security invoker set search_path='' as $currentness_integrity$
declare seal text; obj record; role_name text;
begin
  if current_user<>pg_get_userbyid((select relowner from pg_class
    where oid='public.research_health_quick_order_authority_head'::regclass)) then
    raise exception 'Quick Order publication owner required' using errcode='42501'; end if;
  seal := obj_description('public.research_health_quick_order_authority_head'::regclass,'pg_class');
  if seal is null or seal !~ '^RHQOC_HELD_V1:[0-9a-f]{64}:[0-9a-f]{64}$'
    or split_part(seal,':',3) is distinct from public.research_health_quick_order_currentness_schema_fingerprint() then
    raise exception 'Quick Order currentness schema drift' using errcode='55000'; end if;
  for obj in select oid,proowner,proacl from pg_proc where pronamespace='public'::regnamespace
    and (proname in ('research_health_quick_order_publish_revision','research_health_quick_order_revoke_revision',
      'research_health_quick_order_read_current_authority')
      or proname like 'research\_health\_quick\_order\_currentness\_%' escape '\') loop
    if exists(select 1 from aclexplode(coalesce(obj.proacl,acldefault('f',obj.proowner))) a
      where a.grantee<>obj.proowner) then
      raise exception 'Quick Order currentness function ACL drift' using errcode='55000'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,obj.oid,'EXECUTE') then
        raise exception 'Quick Order currentness function ACL drift' using errcode='55000'; end if;
    end loop;
  end loop;
  for obj in select oid,relowner,relacl from pg_class where relnamespace='public'::regnamespace and relkind in('r','p')
    and relname like 'research\_health\_quick\_order\_authority\_%' escape '\' loop
    if exists(select 1 from aclexplode(coalesce(obj.relacl,acldefault('r',obj.relowner))) a
      where a.grantee<>obj.relowner)
      or exists(select 1 from pg_attribute c cross join lateral aclexplode(c.attacl) a
        where c.attrelid=obj.oid and a.grantee<>obj.relowner) then
      raise exception 'Quick Order currentness table ACL drift' using errcode='55000'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(role_name,obj.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(role_name,obj.oid,'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'Quick Order currentness table ACL drift' using errcode='55000'; end if;
    end loop;
  end loop;
end
$currentness_integrity$;

create function public.research_health_quick_order_publish_revision(p_publication jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $publish_revision$
declare revision uuid; existing jsonb; epoch bigint;
begin
  perform public.research_health_quick_order_currentness_integrity();
  if not public.research_health_quick_order_currentness_valid_publication(p_publication) then
    raise exception 'Invalid Quick Order publication' using errcode='22023'; end if;
  revision := (p_publication->>'revisionId')::uuid;
  insert into public.research_health_quick_order_authority_head(singleton) values(true) on conflict(singleton) do nothing;
  perform 1 from public.research_health_quick_order_authority_head where singleton for update;
  select publication into existing from public.research_health_quick_order_authority_revisions where revision_id=revision;
  if found then
    if existing is distinct from p_publication then
      raise exception 'Quick Order publication conflict' using errcode='23505'; end if;
  else
    insert into public.research_health_quick_order_authority_revisions(revision_id,publication)
      values(revision,p_publication);
  end if;
  -- Even identical re-publication holds a manually changed head. No value in
  -- this metadata envelope can activate intake or choose a Health decision.
  update public.research_health_quick_order_authority_head set state='held',active_revision_id=null,
    last_published_revision_id=revision,writer_epoch=writer_epoch+1,updated_at=clock_timestamp(),updated_by=current_user
    where singleton returning writer_epoch into epoch;
  return jsonb_build_object('state','held','revisionId',revision,'writerEpoch',epoch::text);
end
$publish_revision$;

create function public.research_health_quick_order_revoke_revision(p_revision_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $revoke_revision$
declare epoch bigint;
begin
  perform public.research_health_quick_order_currentness_integrity();
  if p_revision_id is null or p_reason is null or p_reason !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' then
    raise exception 'Invalid Quick Order revocation' using errcode='22023'; end if;
  perform 1 from public.research_health_quick_order_authority_head where singleton for update;
  if not found or not exists(select 1 from public.research_health_quick_order_authority_revisions where revision_id=p_revision_id) then
    raise exception 'Quick Order revision unavailable' using errcode='22023'; end if;
  update public.research_health_quick_order_authority_head set state='held',active_revision_id=null,
    last_revoked_revision_id=p_revision_id,last_revoke_reason=p_reason,writer_epoch=writer_epoch+1,
    updated_at=clock_timestamp(),updated_by=current_user where singleton returning writer_epoch into epoch;
  return jsonb_build_object('state','held','revisionId',p_revision_id,'writerEpoch',epoch::text);
end
$revoke_revision$;

create function public.research_health_quick_order_read_current_authority()
returns jsonb language sql stable security invoker set search_path='' as $read_current_authority$
  -- Intentionally independent of row state: a missing OR manually active head
  -- cannot turn an unimplemented currentness protocol into usable authority.
  select jsonb_build_object('state','unavailable','code','quick_order_currentness_not_implemented');
$read_current_authority$;
revoke all on function public.research_health_quick_order_currentness_valid_publication(jsonb),
  public.research_health_quick_order_currentness_integrity(),
  public.research_health_quick_order_publish_revision(jsonb),
  public.research_health_quick_order_revoke_revision(uuid,text),
  public.research_health_quick_order_read_current_authority() from public,anon,authenticated,service_role;
$currentness_install$;
begin
  perform public.research_assisted_order_provider_settlement_integrity();
  predecessor_fingerprint := public.research_assisted_order_provider_schema_fingerprint();
  if current_user<>pg_get_userbyid((select relowner from pg_class
    where oid='public.research_assisted_order_provider_fence'::regclass)) then
    raise exception 'Canonical schema owner required' using errcode='42501'; end if;
  if (select jsonb_agg(v order by v::text) from jsonb_array_elements(expected_triggers) v)
    is distinct from (select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled::text)
      order by jsonb_build_array(c.relname,t.tgname,t.tgenabled::text)::text)
      from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal
      and c.relnamespace='public'::regnamespace and c.relname in
        ('research_assisted_order_requests','research_assisted_order_events','research_notification_outbox')) then
    raise exception 'Canonical trigger inventory drift' using errcode='55000'; end if;
  expected_definition := encode(extensions.digest(convert_to(
    replace(install_sql||fingerprint_sql,E'\r\n',E'\n'),'UTF8'),'sha256'),'hex');
  select count(*) into installed from pg_class c where c.relnamespace='public'::regnamespace
    and (c.relname like 'research\_health\_quick\_order\_authority\_%' escape '\'
      or c.relname like 'research\_health\_quick\_order\_currentness\_%' escape '\');
  if installed>0 or exists(select 1 from pg_proc where pronamespace='public'::regnamespace
    and (proname in ('research_health_quick_order_publish_revision','research_health_quick_order_revoke_revision',
      'research_health_quick_order_read_current_authority')
      or proname like 'research\_health\_quick\_order\_currentness\_%' escape '\'))
    or exists(select 1 from pg_type where typnamespace='public'::regnamespace
      and (typname like 'research\_health\_quick\_order\_authority\_%' escape '\'
        or typname like 'research\_health\_quick\_order\_currentness\_%' escape '\')) then
    if to_regclass('public.research_health_quick_order_authority_head') is null
      or to_regclass('public.research_health_quick_order_authority_revisions') is null
      or to_regprocedure('public.research_health_quick_order_currentness_integrity()') is null then
      raise exception 'Partial Quick Order currentness schema' using errcode='55000'; end if;
    execute fingerprint_sql into actual_fingerprint;
    seal := obj_description('public.research_health_quick_order_authority_head'::regclass,'pg_class');
    if seal is distinct from 'RHQOC_HELD_V1:'||expected_definition||':'||actual_fingerprint then
      raise exception 'Quick Order currentness definition or schema drift' using errcode='55000'; end if;
  else
    execute install_sql;
    execute format('create function public.research_health_quick_order_currentness_schema_fingerprint() returns text language sql stable security invoker set search_path=%L as %L','',fingerprint_sql);
    revoke all on function public.research_health_quick_order_currentness_schema_fingerprint() from public,anon,authenticated,service_role;
    execute fingerprint_sql into actual_fingerprint;
    execute format('comment on table public.research_health_quick_order_authority_head is %L',
      'RHQOC_HELD_V1:'||expected_definition||':'||actual_fingerprint);
  end if;
  perform public.research_health_quick_order_currentness_integrity();
  perform public.research_assisted_order_provider_settlement_integrity();
  if predecessor_fingerprint is distinct from public.research_assisted_order_provider_schema_fingerprint() then
    raise exception 'Canonical fence changed' using errcode='55000'; end if;
end
$currentness_candidate$;
commit;
