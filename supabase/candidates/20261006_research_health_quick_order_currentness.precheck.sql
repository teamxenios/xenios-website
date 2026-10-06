-- SOURCE-ONLY PRECHECK; NOT EXECUTED OR QUALIFIED.
-- Caller must bind the reviewed candidate's definition digest in session GUC
-- research_health_quick_order.currentness_definition. See verifier/rollback.
-- The digest is SHA256-LF(install_sql || fingerprint_sql), including delimiters'
-- enclosed whitespace, not a digest obtained from the installed database.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local search_path='';
do $currentness_check$
declare expected_definition text := current_setting('research_health_quick_order.currentness_definition',true);
  before_fingerprint text; actual_fingerprint text; seal text; present boolean;
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
begin
  if expected_definition is null or expected_definition !~ '^[0-9a-f]{64}$' then
    raise exception 'Reviewed currentness definition binding required' using errcode='55000'; end if;
  perform public.research_assisted_order_provider_settlement_integrity();
  before_fingerprint := public.research_assisted_order_provider_schema_fingerprint();
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
  present := exists(select 1 from pg_class where relnamespace='public'::regnamespace
      and (relname like 'research\_health\_quick\_order\_authority\_%' escape '\'
        or relname like 'research\_health\_quick\_order\_currentness\_%' escape '\'))
    or exists(select 1 from pg_proc where pronamespace='public'::regnamespace
      and (proname in ('research_health_quick_order_publish_revision','research_health_quick_order_revoke_revision',
        'research_health_quick_order_read_current_authority')
        or proname like 'research\_health\_quick\_order\_currentness\_%' escape '\'))
    or exists(select 1 from pg_type where typnamespace='public'::regnamespace
      and (typname like 'research\_health\_quick\_order\_authority\_%' escape '\'
        or typname like 'research\_health\_quick\_order\_currentness\_%' escape '\'));
  if present then
    if to_regclass('public.research_health_quick_order_authority_head') is null
      or to_regclass('public.research_health_quick_order_authority_revisions') is null
      or to_regprocedure('public.research_health_quick_order_currentness_integrity()') is null then
      raise exception 'Partial Quick Order currentness schema' using errcode='55000'; end if;
    execute fingerprint_sql into actual_fingerprint;
    seal := obj_description('public.research_health_quick_order_authority_head'::regclass,'pg_class');
    if seal is distinct from 'RHQOC_HELD_V1:'||expected_definition||':'||actual_fingerprint then
      raise exception 'Quick Order currentness definition or schema drift' using errcode='55000'; end if;
    perform public.research_health_quick_order_currentness_integrity();
    if exists(select 1 from public.research_health_quick_order_authority_head
        where state<>'held' or active_revision_id is not null)
      or public.research_health_quick_order_read_current_authority() is distinct from
        '{"state":"unavailable","code":"quick_order_currentness_not_implemented"}'::jsonb then
      raise exception 'Quick Order must remain held' using errcode='55000'; end if;

  end if;
  perform public.research_assisted_order_provider_settlement_integrity();
  if before_fingerprint is distinct from public.research_assisted_order_provider_schema_fingerprint() then
    raise exception 'Canonical fence changed' using errcode='55000'; end if;
end
$currentness_check$;
rollback;
-- Commit, source-writer currentness, concurrency and liveness: HELD / NOT IMPLEMENTED.
