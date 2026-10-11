-- Doc82 accepted the unchanged currentness definition for dependent source.
-- Intake successor remains PENDING; real S/census and installation remain held.
-- SOURCE ONLY / NOT RUN. psql variable qo_intake_definition_sha256 is the
-- SHA-256 of the approved candidate's literal qo_ddl + qo_fingerprint blocks,
-- LF normalized. Supply it from an externally SHA-pinned source receipt; never
-- read the installed seal and reuse it as expected authority.
\set ON_ERROR_STOP on
\if :{?qo_intake_definition_sha256}
\else
  \echo 'STOP: externally source-bound qo_intake_definition_sha256 is required'
  do $missing_source_binding$
  begin raise exception 'Externally source-bound qo_intake_definition_sha256 is required' using errcode='55000'; end
  $missing_source_binding$;
\endif
begin transaction read only;
set local search_path='';
select pg_catalog.set_config('xenios.qo_intake_expected_definition',:'qo_intake_definition_sha256',true);
do $qo_precheck$
declare fingerprint_sql pg_catalog.text:=$qo_fingerprint$
select encode(extensions.digest(convert_to(jsonb_build_object(
 'relations',(select jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relowner::pg_catalog.regrole::pg_catalog.text,c.relpersistence,c.reloptions,c.relam,c.reltablespace,c.relrowsecurity,c.relforcerowsecurity,c.relacl) order by c.relname)
   from pg_catalog.pg_class c where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attnum,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attisdropped,a.attcollation,a.attstorage,a.attcompression,a.attstattarget,a.attnotnull,a.attidentity,a.attgenerated,a.attacl,pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum)
   from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid=c.oid
   left join pg_catalog.pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
   where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake' and a.attnum>0),
 'constraints',(select jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_catalog.pg_get_constraintdef(k.oid,true),k.convalidated) order by c.relname,k.conname)
   from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid=c.oid where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'indexes',(select jsonb_agg(jsonb_build_array(c.relname,pg_catalog.pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) order by c.relname,i.indexrelid::pg_catalog.regclass::pg_catalog.text)
   from pg_catalog.pg_class c join pg_catalog.pg_index i on i.indrelid=c.oid where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'rules',(select jsonb_agg(jsonb_build_array(c.relname,r.rulename,pg_catalog.pg_get_ruledef(r.oid,true),r.ev_enabled) order by c.relname,r.rulename)
   from pg_catalog.pg_class c join pg_catalog.pg_rewrite r on r.ev_class=c.oid where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'policies',(select jsonb_agg(jsonb_build_array(c.relname,po.polname,po.polcmd,po.polpermissive,po.polroles,pg_catalog.pg_get_expr(po.polqual,po.polrelid),pg_catalog.pg_get_expr(po.polwithcheck,po.polrelid)) order by c.relname,po.polname)
   from pg_catalog.pg_class c join pg_catalog.pg_policy po on po.polrelid=c.oid where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_catalog.pg_get_triggerdef(t.oid,true),t.tgenabled) order by c.relname,t.tgname)
   from pg_catalog.pg_class c join pg_catalog.pg_trigger t on t.tgrelid=c.oid where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake' and not t.tgisinternal),
 'functions',(select jsonb_agg(jsonb_build_array(p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid),pg_catalog.pg_get_functiondef(p.oid),p.proowner::pg_catalog.regrole::pg_catalog.text,p.proacl) order by p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid))
   from pg_catalog.pg_proc p where p.pronamespace='public'::pg_catalog.regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit')))
 )::pg_catalog.text,'UTF8'),'sha256'),'hex')
$qo_fingerprint$;
  expected_hash pg_catalog.text:=current_setting('xenios.qo_intake_expected_definition',true);
  actual_hash pg_catalog.text; seal pg_catalog.text; relation_count integer; function_count integer;
  fn pg_catalog.record; role_name pg_catalog.text; provider_before pg_catalog.text;
  expected_currentness_definition pg_catalog.text:='8b631a8323394d8277986b3be6560a494bf541e102e93ad263a7a5990e3baabe';
  currentness_seal pg_catalog.text;
begin
  if expected_hash is null or expected_hash!~'^[a-f0-9]{64}$'
    or current_setting('transaction_isolation')<>'read committed'
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4 <170011
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4 >=180000
    or not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
    or current_user::pg_catalog.regrole::pg_catalog.oid is distinct from (select relowner from pg_catalog.pg_class
      where oid=pg_catalog.to_regclass('public.research_assisted_order_provider_fence'))
  then raise exception 'Quick Order source binding or owner unavailable' using errcode='55000'; end if;

  if expected_currentness_definition is null then
    raise exception 'Quick Order exact accepted currentness receipt is pending' using errcode='55000';
  end if;
  -- Complete accepted function identity/owner/search_path/security inventory.
  if (select pg_catalog.count(*) from pg_catalog.pg_proc p where p.pronamespace='public'::pg_catalog.regnamespace
      and (p.proname in ('research_health_quick_order_publish_revision','research_health_quick_order_revoke_revision','research_health_quick_order_read_current_authority','research_health_quick_order_guard_source_write')
        or pg_catalog.starts_with(p.proname,'research_health_quick_order_currentness_')))<>13
    or exists(select 1 from (values ('public.research_health_quick_order_currentness_valid_publication(pg_catalog.jsonb)'),('public.research_health_quick_order_currentness_valid_decision_inputs(pg_catalog.text,pg_catalog.jsonb)'),('public.research_health_quick_order_currentness_refuse_mutation()'),('public.research_health_quick_order_currentness_monotonic_epoch()'),('public.research_health_quick_order_currentness_integrity()'),('public.research_health_quick_order_currentness_schema_fingerprint()'),('public.research_health_quick_order_currentness_read_strict_authority(pg_catalog.timestamptz)'),('public.research_health_quick_order_currentness_resolve_scope(pg_catalog.uuid,pg_catalog.text,pg_catalog.jsonb)'),('public.research_health_quick_order_currentness_activate_revision(pg_catalog.uuid,pg_catalog.int8,pg_catalog.text,pg_catalog.text)'),('public.research_health_quick_order_guard_source_write()'),('public.research_health_quick_order_publish_revision(pg_catalog.jsonb,pg_catalog.text)'),('public.research_health_quick_order_revoke_revision(pg_catalog.uuid,pg_catalog.text)'),('public.research_health_quick_order_read_current_authority()')) expected(signature)
      left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(expected.signature)
      where p.oid is null or p.proowner<>(select oid from pg_catalog.pg_roles where rolname=current_user)
        or p.proconfig is distinct from array['search_path=""']::pg_catalog.text[]
        or p.prosecdef is distinct from (p.proname='research_health_quick_order_guard_source_write')) then
    raise exception 'Quick Order exact function inventory mismatch' using errcode='55000'; end if;
  currentness_seal:=pg_catalog.obj_description(pg_catalog.to_regclass('public.research_health_quick_order_authority_head'),'pg_class');
  if expected_currentness_definition !~ '^[a-f0-9]{64}$'
    or currentness_seal is null or currentness_seal !~ '^RHQOC_HELD_V1:[0-9a-f]{64}:[0-9a-f]{64}$'
    or pg_catalog.split_part(currentness_seal,':',2) is distinct from expected_currentness_definition then
    raise exception 'Quick Order accepted currentness definition differs' using errcode='55000';
  end if;
  if pg_catalog.split_part(currentness_seal,':',3) is distinct from public.research_health_quick_order_currentness_schema_fingerprint() then
    raise exception 'Quick Order accepted currentness fingerprint differs' using errcode='55000';
  end if;
  -- Includes the accepted corrected legal guard, source descriptors and ACLs.
  -- Actual implemented-S/census descriptor remains absent and fails closed.
  perform public.research_health_quick_order_currentness_integrity();

  perform public.research_assisted_order_provider_settlement_integrity();
  if exists (
    with expected(relation_name, trigger_name, enabled) as (values
      ('research_assisted_order_requests','research_assisted_order_paid_hold','O'),
      ('research_assisted_order_requests','hl12_observed_cancel','O'),
      ('research_assisted_order_requests','hl12_history_progression','O'),
      ('research_assisted_order_requests','aa_hl12_disposition_terminal','O'),
      ('research_assisted_order_requests','aaa_adp01_uncertainty','A'),
      ('research_assisted_order_requests','adp03_request_identity','A'),
      ('research_assisted_order_requests','adp03_evidence_truncate','A'),
      ('research_assisted_order_requests','adp03_evidence_immutable','A'),
      ('research_assisted_order_events','research_assisted_order_events_append_only','A'),
      ('research_assisted_order_events','research_assisted_order_paid_event_evidence','A'),
      ('research_assisted_order_events','hl12_disposition_cancel_event','O'),
      ('research_assisted_order_events','adp03_paid_event','A'),
      ('research_assisted_order_events','adp03_evidence_truncate','A'),
      ('research_assisted_order_events','adp03_evidence_immutable','A'),
      ('research_assisted_order_events','hl12_disposition_no_truncate','O'),
      ('research_notification_outbox','hl12_payment_effects_outbox_guard','A'),
      ('research_notification_outbox','hl12_payment_effects_outbox_truncate','A'),
      ('research_notification_outbox','hl12_disposition_effects_outbox','O'),
      ('research_notification_outbox','hl12_disposition_effects_truncate','O')
    ), actual as (
      select c.relname::pg_catalog.text relation_name,t.tgname::pg_catalog.text trigger_name,t.tgenabled::pg_catalog.text enabled
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
      where c.relnamespace='public'::pg_catalog.regnamespace and not t.tgisinternal
        and c.relname in ('research_assisted_order_requests','research_assisted_order_events','research_notification_outbox')
    )
    select 1 from expected e full join actual a using(relation_name,trigger_name)
    where e.enabled is distinct from a.enabled
  ) then raise exception 'Quick Order predecessor trigger inventory differs' using errcode='55000'; end if;

  provider_before:=public.research_assisted_order_provider_schema_fingerprint();
  select count(*) into relation_count from pg_catalog.pg_class c where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake';
  select count(*) into function_count from pg_catalog.pg_proc p where p.pronamespace='public'::pg_catalog.regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit'));
  if relation_count=0 and function_count=0 then
    raise notice 'QUICK_ORDER_INTAKE_PRECHECK: all draft objects absent';
  else
    if relation_count<>3 or function_count<>5 or pg_catalog.to_regclass('public.research_health_quick_order_intakes') is null then
      raise exception 'Quick Order partial or unknown installation' using errcode='55000';
    end if;
    execute fingerprint_sql into actual_hash;
    seal:=pg_catalog.obj_description('public.research_health_quick_order_intakes'::pg_catalog.regclass,'pg_class');
    if seal is distinct from 'QO_INTAKE_TRANSACTION_V2:'||expected_hash||':'||actual_hash then
      raise exception 'Quick Order source/catalog seal differs' using errcode='55000';
    end if;

  if (select count(*) from pg_catalog.pg_proc p where p.pronamespace='public'::pg_catalog.regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit')))<>5
    or (select count(*) from pg_catalog.pg_class c where c.relnamespace='public'::pg_catalog.regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake')<>3
    or not exists(select 1 from pg_catalog.pg_class where oid='public.research_health_quick_order_intakes'::pg_catalog.regclass
      and relkind='r' and relrowsecurity and relforcerowsecurity and relowner=current_user::pg_catalog.regrole)
    or exists(select 1 from pg_catalog.pg_policy where polrelid='public.research_health_quick_order_intakes'::pg_catalog.regclass)
    or exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.research_health_quick_order_intakes'::pg_catalog.regclass and not tgisinternal)
  then raise exception 'Quick Order installation shape differs' using errcode='55000'; end if;
  if exists(select 1 from pg_catalog.pg_class c,
      lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
      where c.oid='public.research_health_quick_order_intakes'::pg_catalog.regclass and a.grantee<>c.relowner)
    or exists(select 1 from pg_catalog.pg_attribute a,
      lateral pg_catalog.aclexplode(a.attacl) g
      where a.attrelid='public.research_health_quick_order_intakes'::pg_catalog.regclass and g.grantee<>current_user::pg_catalog.regrole::pg_catalog.oid)
  then raise exception 'Quick Order table or column grants differ' using errcode='55000'; end if;
  for fn in select * from pg_catalog.pg_proc p where p.pronamespace='public'::pg_catalog.regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit')) loop
    if fn.proowner<>current_user::pg_catalog.regrole::pg_catalog.oid or fn.prokind<>'f'
      or fn.oid not in ('public.research_health_quick_order_intake_closed(pg_catalog.jsonb,pg_catalog.text[])'::pg_catalog.regprocedure,
        'public.research_health_quick_order_intake_valid(pg_catalog.uuid,pg_catalog.text,pg_catalog.timestamptz,pg_catalog.jsonb,pg_catalog.jsonb,pg_catalog.jsonb)'::pg_catalog.regprocedure,
        'public.research_health_quick_order_admin_detail(pg_catalog.uuid)'::pg_catalog.regprocedure,
        'public.research_health_quick_order_replay(pg_catalog.text,pg_catalog.text)'::pg_catalog.regprocedure,
        'public.research_health_quick_order_commit(pg_catalog.jsonb)'::pg_catalog.regprocedure)
      or fn.proconfig is distinct from array['search_path=""']::pg_catalog.text[]
      or fn.prosecdef is distinct from (fn.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit'))
      or exists(select 1 from pg_catalog.aclexplode(coalesce(fn.proacl,pg_catalog.acldefault('f',fn.proowner))) a
        where a.grantee<>fn.proowner and (a.grantee<>'service_role'::pg_catalog.regrole::pg_catalog.oid
          or fn.proname not in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit')
          or a.privilege_type<>'EXECUTE' or a.is_grantable))
    then raise exception 'Quick Order function authority differs' using errcode='55000'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if pg_catalog.has_function_privilege(role_name,fn.oid,'EXECUTE') is distinct from
        (role_name='service_role' and fn.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail','research_health_quick_order_commit'))
      then raise exception 'Quick Order effective execute authority differs' using errcode='55000'; end if;
    end loop;
  end loop;

    raise notice 'QUICK_ORDER_INTAKE_PRECHECK: exact disabled-source RPC surface; no execution or atomic-intake proof';
  end if;

  perform public.research_assisted_order_provider_settlement_integrity();
  if exists (
    with expected(relation_name, trigger_name, enabled) as (values
      ('research_assisted_order_requests','research_assisted_order_paid_hold','O'),
      ('research_assisted_order_requests','hl12_observed_cancel','O'),
      ('research_assisted_order_requests','hl12_history_progression','O'),
      ('research_assisted_order_requests','aa_hl12_disposition_terminal','O'),
      ('research_assisted_order_requests','aaa_adp01_uncertainty','A'),
      ('research_assisted_order_requests','adp03_request_identity','A'),
      ('research_assisted_order_requests','adp03_evidence_truncate','A'),
      ('research_assisted_order_requests','adp03_evidence_immutable','A'),
      ('research_assisted_order_events','research_assisted_order_events_append_only','A'),
      ('research_assisted_order_events','research_assisted_order_paid_event_evidence','A'),
      ('research_assisted_order_events','hl12_disposition_cancel_event','O'),
      ('research_assisted_order_events','adp03_paid_event','A'),
      ('research_assisted_order_events','adp03_evidence_truncate','A'),
      ('research_assisted_order_events','adp03_evidence_immutable','A'),
      ('research_assisted_order_events','hl12_disposition_no_truncate','O'),
      ('research_notification_outbox','hl12_payment_effects_outbox_guard','A'),
      ('research_notification_outbox','hl12_payment_effects_outbox_truncate','A'),
      ('research_notification_outbox','hl12_disposition_effects_outbox','O'),
      ('research_notification_outbox','hl12_disposition_effects_truncate','O')
    ), actual as (
      select c.relname::pg_catalog.text relation_name,t.tgname::pg_catalog.text trigger_name,t.tgenabled::pg_catalog.text enabled
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
      where c.relnamespace='public'::pg_catalog.regnamespace and not t.tgisinternal
        and c.relname in ('research_assisted_order_requests','research_assisted_order_events','research_notification_outbox')
    )
    select 1 from expected e full join actual a using(relation_name,trigger_name)
    where e.enabled is distinct from a.enabled
  ) then raise exception 'Quick Order predecessor trigger inventory differs' using errcode='55000'; end if;

  if public.research_assisted_order_provider_schema_fingerprint() is distinct from provider_before then
    raise exception 'Canonical fingerprint changed across check' using errcode='55000';
  end if;
end
$qo_precheck$;
rollback;
