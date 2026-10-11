-- SOURCE-ONLY POSTCHECK; NOT EXECUTED OR QUALIFIED.
-- Caller must bind the reviewed candidate's definition digest in session GUC
-- research_health_quick_order.currentness_definition. See verifier/rollback.
-- The digest is SHA256-LF(install_sql || fingerprint_sql), including delimiters'
-- enclosed whitespace, not a digest obtained from the installed database.
begin;
set local search_path='';
do $currentness_check$
declare expected_definition pg_catalog.text := pg_catalog.current_setting('research_health_quick_order.currentness_definition',true);
  source_column_descriptor_seal constant pg_catalog.text := null; actual_columns pg_catalog.text;
  before_fingerprint pg_catalog.text; actual_fingerprint pg_catalog.text; seal pg_catalog.text; present boolean;
  expected_triggers constant pg_catalog.jsonb := '[
    ["research_assisted_order_requests","research_assisted_order_paid_hold","O"],
    ["research_assisted_order_requests","hl12_observed_cancel","O"],
    ["research_assisted_order_requests","hl12_history_progression","O"],
    ["research_assisted_order_requests","aa_hl12_disposition_terminal","O"],
    ["research_assisted_order_requests","aaa_adp01_uncertainty","A"],
    ["research_assisted_order_requests","adp03_request_identity","A"],
    ["research_assisted_order_requests","adp03_evidence_truncate","A"],
    ["research_assisted_order_requests","adp03_evidence_immutable","A"],
    ["research_assisted_order_events","research_assisted_order_events_append_only","A"],
    ["research_assisted_order_events","research_assisted_order_paid_event_evidence","A"],
    ["research_assisted_order_events","hl12_disposition_cancel_event","O"],
    ["research_assisted_order_events","adp03_paid_event","A"],
    ["research_assisted_order_events","adp03_evidence_truncate","A"],
    ["research_assisted_order_events","adp03_evidence_immutable","A"],
    ["research_assisted_order_events","hl12_disposition_no_truncate","O"],
    ["research_notification_outbox","hl12_payment_effects_outbox_guard","A"],
    ["research_notification_outbox","hl12_payment_effects_outbox_truncate","A"],
    ["research_notification_outbox","hl12_disposition_effects_outbox","O"],
    ["research_notification_outbox","hl12_disposition_effects_truncate","O"]
  ]'::pg_catalog.jsonb;
  fingerprint_sql pg_catalog.text := $currentness_fingerprint$
with owned_relations as (
  select c.* from pg_catalog.pg_class c
  where c.relnamespace = 'public'::pg_catalog.regnamespace
    and (c.relname like 'research\_health\_quick\_order\_authority\_%' escape '\'
      or c.relname like 'research\_health\_quick\_order\_currentness\_%' escape '\')
), owned_functions as (
  select p.* from pg_catalog.pg_proc p where p.pronamespace = 'public'::pg_catalog.regnamespace
    and (p.proname in ('research_health_quick_order_publish_revision',
      'research_health_quick_order_revoke_revision','research_health_quick_order_read_current_authority','research_health_quick_order_guard_source_write')
      or p.proname like 'research\_health\_quick\_order\_currentness\_%' escape '\')
)
select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
  'functions',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.oid::pg_catalog.regprocedure::pg_catalog.text,pg_catalog.pg_get_functiondef(p.oid),
    p.proowner::pg_catalog.regrole::pg_catalog.text,p.proacl::pg_catalog.text) order by p.oid::pg_catalog.regprocedure::pg_catalog.text) from owned_functions p),
  'relations',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,c.relkind,c.relpersistence,c.relrowsecurity,
    c.relforcerowsecurity,c.relowner::pg_catalog.regrole::pg_catalog.text,c.relacl::pg_catalog.text,c.reloptions) order by c.relname) from owned_relations c),
  'columns',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,a.attnum,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),
    a.attnotnull,a.attisdropped,a.attgenerated,a.attidentity,a.attcollation::pg_catalog.regcollation::pg_catalog.text,a.attacl::pg_catalog.text,
    pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum)
    from owned_relations c join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum>0
    left join pg_catalog.pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum),
  'constraints',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,k.conname,pg_catalog.pg_get_constraintdef(k.oid,true),
    k.convalidated,k.condeferrable,k.condeferred) order by c.relname,k.conname)
    from owned_relations c join pg_catalog.pg_constraint k on k.conrelid=c.oid),
  'indexes',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,pg_catalog.pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready)
    order by c.relname,i.indexrelid::pg_catalog.regclass::pg_catalog.text) from owned_relations c join pg_catalog.pg_index i on i.indrelid=c.oid),
  'triggers',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,t.tgname,pg_catalog.pg_get_triggerdef(t.oid,true),t.tgenabled)
    order by c.relname,t.tgname) from owned_relations c join pg_catalog.pg_trigger t on t.tgrelid=c.oid
    where not t.tgisinternal),
  'sourceColumns',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,a.attnum,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attisdropped,a.attgenerated,a.attidentity,a.attcollation::pg_catalog.regcollation::pg_catalog.text)
    order by c.relname,a.attnum) from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum>0
    where c.relnamespace='public'::pg_catalog.regnamespace and c.relname=any(array['research_domain_launch_controls','research_early_access_legal_bindings','research_early_access_session_bindings','research_early_access_shipping_regions','research_inventory_lots','research_lot_quality_documents','research_lot_quality_tests','research_product_content','research_product_prices','research_product_variants','research_products','research_required_inputs'])),
  'sourceGuards',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.nspname,c.relname,t.tgname,pg_catalog.pg_get_triggerdef(t.oid,true),t.tgenabled,t.tgfoid::pg_catalog.regprocedure::pg_catalog.text,t.tgtype,t.tgnargs,t.tgargs,t.tgoldtable,t.tgnewtable,t.tgconstraint,t.tgdeferrable,t.tginitdeferred,pg_catalog.obj_description(t.oid,'pg_trigger'))
    order by n.nspname,c.relname,t.tgname) from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and t.tgname like 'research\_health\_quick\_order\_guard\_%' escape '\'),
  'policies',(select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by p.tablename,p.policyname) from pg_catalog.pg_policies p
    where p.schemaname='public' and p.tablename in(select relname from owned_relations)),
  'rules',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,r.rulename,pg_catalog.pg_get_ruledef(r.oid),r.ev_enabled)
    order by c.relname,r.rulename) from owned_relations c join pg_catalog.pg_rewrite r on r.ev_class=c.oid),
  'types',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(t.typname,t.typtype,t.typowner::pg_catalog.regrole::pg_catalog.text,t.typacl::pg_catalog.text)
    order by t.typname) from pg_catalog.pg_type t where t.typnamespace='public'::pg_catalog.regnamespace
    and (t.typname like 'research\_health\_quick\_order\_authority\_%' escape '\'
      or t.typname like 'research\_health\_quick\_order\_currentness\_%' escape '\'))
)::pg_catalog.text,'UTF8'),'sha256'),'hex');
$currentness_fingerprint$;
begin
  if pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17
    or pg_catalog.current_setting('server_version_num')::integer < 170011 then
    raise exception 'Quick Order requires reviewed PostgreSQL 17.11 or later 17.x' using errcode='55000'; end if;
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Quick Order requires READ COMMITTED' using errcode='55000'; end if;
  if source_column_descriptor_seal is null then
    raise exception 'Quick Order accepted S/census source-column descriptor not yet bound' using errcode='55000'; end if;
  -- DOC80_SOURCE_STRUCTURE_BEGIN: identical in install/reapply, pre/post,
  -- runtime integrity and rollback. Columns are pinned by the independently
  -- accepted descriptor and trigger comments; common owner by integrity's owner
  -- predicate. Source defaults/constraints/indexes/RLS/ACL are NOT adopted (MD640).
  if (with guarded as (select c.* from pg_catalog.pg_class c
      where c.relnamespace='public'::pg_catalog.regnamespace and c.relname=any(array['research_domain_launch_controls','research_early_access_legal_bindings','research_early_access_session_bindings','research_early_access_shipping_regions','research_inventory_lots','research_lot_quality_documents','research_lot_quality_tests','research_product_content','research_product_prices','research_product_variants','research_products','research_required_inputs']))
    select pg_catalog.count(*)<>12 or coalesce(pg_catalog.bool_or(relkind<>'r' or relispartition),false)
      or exists(select 1 from pg_catalog.pg_inherits i where i.inhrelid in(select oid from guarded) or i.inhparent in(select oid from guarded))
      or exists(select 1 from pg_catalog.pg_rewrite r where r.ev_class in(select oid from guarded))
      or exists(select 1 from pg_catalog.pg_subscription_rel r where r.srrelid in(select oid from guarded))
    from guarded) then
    raise exception 'Quick Order source relation structure drift' using errcode='55000'; end if;
  -- DOC80_SOURCE_STRUCTURE_END
  select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.string_agg(
    c.relname||':'||pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attnum,a.attname,
    pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attisdropped,a.attgenerated,a.attidentity,a.attcollation::pg_catalog.regcollation::pg_catalog.text)
    order by a.attnum)::pg_catalog.text from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0),'[]'),'UTF8'),'sha256'),'hex'),E'\n' order by c.relname collate pg_catalog."C"),'UTF8'),'sha256'),'hex') into actual_columns
    from pg_catalog.pg_class c where c.relnamespace='public'::pg_catalog.regnamespace and c.relname=any(array['research_domain_launch_controls','research_early_access_legal_bindings','research_early_access_session_bindings','research_early_access_shipping_regions','research_inventory_lots','research_lot_quality_documents','research_lot_quality_tests','research_product_content','research_product_prices','research_product_variants','research_products','research_required_inputs']);
  if source_column_descriptor_seal !~ '^[0-9a-f]{64}$'
    or source_column_descriptor_seal is distinct from actual_columns then
    raise exception 'Quick Order source-column descriptor drift' using errcode='55000'; end if;
  if expected_definition is null or expected_definition !~ '^[0-9a-f]{64}$' then
    raise exception 'Reviewed currentness definition binding required' using errcode='55000'; end if;
  perform public.research_assisted_order_provider_settlement_integrity();
  before_fingerprint := public.research_assisted_order_provider_schema_fingerprint();
  if current_user<>pg_catalog.pg_get_userbyid((select relowner from pg_catalog.pg_class
    where oid='public.research_assisted_order_provider_fence'::pg_catalog.regclass)) then
    raise exception 'Canonical schema owner required' using errcode='42501'; end if;
  if (select pg_catalog.jsonb_agg(v order by v::pg_catalog.text) from pg_catalog.jsonb_array_elements(expected_triggers) v)
    is distinct from (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,t.tgname,t.tgenabled::pg_catalog.text)
      order by pg_catalog.jsonb_build_array(c.relname,t.tgname,t.tgenabled::pg_catalog.text)::pg_catalog.text)
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid where not t.tgisinternal
      and c.relnamespace='public'::pg_catalog.regnamespace and c.relname in
        ('research_assisted_order_requests','research_assisted_order_events','research_notification_outbox')) then
    raise exception 'Canonical trigger inventory drift' using errcode='55000'; end if;
  present := exists(select 1 from pg_catalog.pg_class where relnamespace='public'::pg_catalog.regnamespace
      and (relname like 'research\_health\_quick\_order\_authority\_%' escape '\'
        or relname like 'research\_health\_quick\_order\_currentness\_%' escape '\'))
    or exists(select 1 from pg_catalog.pg_proc where pronamespace='public'::pg_catalog.regnamespace
      and (proname in ('research_health_quick_order_publish_revision','research_health_quick_order_revoke_revision',
        'research_health_quick_order_read_current_authority','research_health_quick_order_guard_source_write')
        or proname like 'research\_health\_quick\_order\_currentness\_%' escape '\'))
    or exists(select 1 from pg_catalog.pg_type where typnamespace='public'::pg_catalog.regnamespace
      and (typname like 'research\_health\_quick\_order\_authority\_%' escape '\'
        or typname like 'research\_health\_quick\_order\_currentness\_%' escape '\'));
  if present then
    if pg_catalog.to_regclass('public.research_health_quick_order_authority_head') is null
      or pg_catalog.to_regclass('public.research_health_quick_order_authority_revisions') is null
      or pg_catalog.to_regprocedure('public.research_health_quick_order_currentness_integrity()') is null then
      raise exception 'Partial Quick Order currentness schema' using errcode='55000'; end if;
    execute fingerprint_sql into actual_fingerprint;
    seal := pg_catalog.obj_description('public.research_health_quick_order_authority_head'::pg_catalog.regclass,'pg_class');
    if seal is distinct from 'RHQOC_HELD_V1:'||expected_definition||':'||actual_fingerprint then
      raise exception 'Quick Order currentness definition or schema drift' using errcode='55000'; end if;
    perform public.research_health_quick_order_currentness_integrity();
    -- The sealed definition binds the exact CHECK body and full new signature.
    -- No legacy publication overload or old installed-schema conversion is allowed.
    if pg_catalog.to_regprocedure('public.research_health_quick_order_publish_revision(pg_catalog.jsonb,pg_catalog.text)') is null
      or pg_catalog.to_regprocedure('public.research_health_quick_order_publish_revision(pg_catalog.jsonb)') is not null
      or not exists(select 1 from pg_catalog.pg_attribute where
        attrelid='public.research_health_quick_order_authority_revisions'::pg_catalog.regclass
        and attname='decision_inputs_text' and atttypid='pg_catalog.text'::pg_catalog.regtype
        and attnotnull and not attisdropped)
      or not exists(select 1 from pg_catalog.pg_constraint where
        conrelid='public.research_health_quick_order_authority_revisions'::pg_catalog.regclass
        and conname='research_health_quick_order_decision_inputs_shape'
        and contype='c' and convalidated)
      or not exists(select 1 from pg_catalog.pg_proc where
        oid=pg_catalog.to_regprocedure('public.research_health_quick_order_currentness_valid_decision_inputs(pg_catalog.text,pg_catalog.jsonb)')
        and provolatile='i' and not prosecdef and prorettype='pg_catalog.bool'::pg_catalog.regtype
        and proconfig=array['search_path=""']::pg_catalog.text[]) then
      raise exception 'Quick Order decision-input schema unavailable' using errcode='55000'; end if;
    -- Integrity checks the six RESTRICT FKs, resolved references and eight
    -- authority/history user triggers independently of internal RI triggers.
    if not exists(select 1 from public.research_health_quick_order_authority_head
        where singleton and state='held' and active_revision_id is null)
      or exists(select 1 from public.research_health_quick_order_authority_head
        where state<>'held' or active_revision_id is not null)
      or public.research_health_quick_order_read_current_authority() is distinct from
        '{"state":"unavailable","code":"quick_order_currentness_not_implemented"}'::pg_catalog.jsonb then
      raise exception 'Quick Order must remain held' using errcode='55000'; end if;
  else
    raise exception 'Quick Order currentness installation absent' using errcode='55000';
  end if;
  perform public.research_assisted_order_provider_settlement_integrity();
  if before_fingerprint is distinct from public.research_assisted_order_provider_schema_fingerprint() then
    raise exception 'Canonical fence changed' using errcode='55000'; end if;
end
$currentness_check$;
rollback;
-- Disabled transaction/guard source is authored. Installation and all execution
-- remain held; no schema descriptor or accepted exact-target proof is supplied.
