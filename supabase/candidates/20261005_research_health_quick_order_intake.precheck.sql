-- SOURCE ONLY / NOT RUN. psql variable qo_intake_definition_sha256 is the
-- SHA-256 of the approved candidate's literal qo_ddl + qo_fingerprint blocks,
-- LF normalized. Supply it from an externally SHA-pinned source receipt; never
-- read the installed seal and reuse it as expected authority.
\set ON_ERROR_STOP on
\if :{?qo_intake_definition_sha256}
\else
  \echo 'STOP: externally source-bound qo_intake_definition_sha256 is required'
  \quit 2
\endif
begin transaction read only;
set local search_path='';
set local statement_timeout='30s';
select pg_catalog.set_config('xenios.qo_intake_expected_definition',:'qo_intake_definition_sha256',true);
do $qo_precheck$
declare fingerprint_sql text:=$qo_fingerprint$
select encode(extensions.digest(convert_to(jsonb_build_object(
 'relations',(select jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relowner::regrole::text,c.relpersistence,c.reloptions,c.relam,c.reltablespace,c.relrowsecurity,c.relforcerowsecurity,c.relacl) order by c.relname)
   from pg_catalog.pg_class c where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attnum,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attisdropped,a.attcollation,a.attstorage,a.attcompression,a.attstattarget,a.attnotnull,a.attidentity,a.attgenerated,a.attacl,pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum)
   from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid=c.oid
   left join pg_catalog.pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
   where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake' and a.attnum>0),
 'constraints',(select jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_catalog.pg_get_constraintdef(k.oid,true),k.convalidated) order by c.relname,k.conname)
   from pg_catalog.pg_class c join pg_catalog.pg_constraint k on k.conrelid=c.oid where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'indexes',(select jsonb_agg(jsonb_build_array(c.relname,pg_catalog.pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) order by c.relname,i.indexrelid::regclass::text)
   from pg_catalog.pg_class c join pg_catalog.pg_index i on i.indrelid=c.oid where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'rules',(select jsonb_agg(jsonb_build_array(c.relname,r.rulename,pg_catalog.pg_get_ruledef(r.oid,true),r.ev_enabled) order by c.relname,r.rulename)
   from pg_catalog.pg_class c join pg_catalog.pg_rewrite r on r.ev_class=c.oid where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'policies',(select jsonb_agg(jsonb_build_array(c.relname,po.polname,po.polcmd,po.polpermissive,po.polroles,pg_catalog.pg_get_expr(po.polqual,po.polrelid),pg_catalog.pg_get_expr(po.polwithcheck,po.polrelid)) order by c.relname,po.polname)
   from pg_catalog.pg_class c join pg_catalog.pg_policy po on po.polrelid=c.oid where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake'),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_catalog.pg_get_triggerdef(t.oid,true),t.tgenabled) order by c.relname,t.tgname)
   from pg_catalog.pg_class c join pg_catalog.pg_trigger t on t.tgrelid=c.oid where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake' and not t.tgisinternal),
 'functions',(select jsonb_agg(jsonb_build_array(p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid),pg_catalog.pg_get_functiondef(p.oid),p.proowner::regrole::text,p.proacl) order by p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid))
   from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail')))
 )::text,'UTF8'),'sha256'),'hex')
$qo_fingerprint$;
  expected_hash text:=current_setting('xenios.qo_intake_expected_definition',true);
  actual_hash text; seal text; relation_count integer; function_count integer;
  fn record; role_name text; provider_before text;
begin
  if expected_hash is null or expected_hash!~'^[a-f0-9]{64}$'
    or current_setting('transaction_isolation')<>'read committed'
    or not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
    or current_user::regrole::oid is distinct from (select relowner from pg_catalog.pg_class
      where oid=pg_catalog.to_regclass('public.research_assisted_order_provider_fence'))
  then raise exception 'Quick Order source binding or owner unavailable' using errcode='55000'; end if;

  perform public.research_assisted_order_provider_settlement_integrity();
  if exists (
    with expected(relation_name, trigger_name, enabled) as (values
      ('research_assisted_order_requests','research_assisted_order_paid_hold','O'),
      ('research_assisted_order_requests','hl12_observed_cancel','O'),
      ('research_assisted_order_requests','hl12_history_progression','O'),
      ('research_assisted_order_requests','aa_hl12_disposition_terminal','O'),
      ('research_assisted_order_requests','aaa_adp01_uncertainty','A'),
      ('research_assisted_order_requests','adp03_request_identity','A'),
      ('research_assisted_order_events','research_assisted_order_events_append_only','A'),
      ('research_assisted_order_events','research_assisted_order_paid_event_evidence','A'),
      ('research_assisted_order_events','hl12_disposition_cancel_event','O'),
      ('research_assisted_order_events','adp03_paid_event','A'),
      ('research_notification_outbox','hl12_payment_effects_outbox_guard','A'),
      ('research_notification_outbox','hl12_payment_effects_outbox_truncate','A'),
      ('research_notification_outbox','hl12_disposition_effects_outbox','O'),
      ('research_notification_outbox','hl12_disposition_effects_truncate','O')
    ), actual as (
      select c.relname::text relation_name,t.tgname::text trigger_name,t.tgenabled::text enabled
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
      where c.relnamespace='public'::regnamespace and not t.tgisinternal
        and c.relname in ('research_assisted_order_requests','research_assisted_order_events','research_notification_outbox')
    )
    select 1 from expected e full join actual a using(relation_name,trigger_name)
    where e.enabled is distinct from a.enabled
  ) then raise exception 'Quick Order predecessor trigger inventory differs' using errcode='55000'; end if;

  provider_before:=public.research_assisted_order_provider_schema_fingerprint();
  select count(*) into relation_count from pg_catalog.pg_class c where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake';
  select count(*) into function_count from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail'));
  if relation_count=0 and function_count=0 then
    raise notice 'QUICK_ORDER_INTAKE_PRECHECK: all draft objects absent';
  else
    if relation_count<>3 or function_count<>4 or pg_catalog.to_regclass('public.research_health_quick_order_intakes') is null then
      raise exception 'Quick Order partial or unknown installation' using errcode='55000';
    end if;
    execute fingerprint_sql into actual_hash;
    seal:=pg_catalog.obj_description('public.research_health_quick_order_intakes'::regclass,'pg_class');
    if seal is distinct from 'QO_INTAKE_READERS_V1:'||expected_hash||':'||actual_hash then
      raise exception 'Quick Order source/catalog seal differs' using errcode='55000';
    end if;

  if (select count(*) from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail')))<>4
    or (select count(*) from pg_catalog.pg_class c where c.relnamespace='public'::regnamespace and left(c.relname,length('research_health_quick_order_intake'))='research_health_quick_order_intake')<>3
    or not exists(select 1 from pg_catalog.pg_class where oid='public.research_health_quick_order_intakes'::regclass
      and relkind='r' and relrowsecurity and relforcerowsecurity and relowner=current_user::regrole)
    or exists(select 1 from pg_catalog.pg_policy where polrelid='public.research_health_quick_order_intakes'::regclass)
    or exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.research_health_quick_order_intakes'::regclass and not tgisinternal)
  then raise exception 'Quick Order installation shape differs' using errcode='55000'; end if;
  if exists(select 1 from pg_catalog.pg_class c,
      lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
      where c.oid='public.research_health_quick_order_intakes'::regclass and a.grantee<>c.relowner)
    or exists(select 1 from pg_catalog.pg_attribute a,
      lateral pg_catalog.aclexplode(a.attacl) g
      where a.attrelid='public.research_health_quick_order_intakes'::regclass and g.grantee<>current_user::regrole::oid)
  then raise exception 'Quick Order table or column grants differ' using errcode='55000'; end if;
  for fn in select * from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and (left(p.proname,length('research_health_quick_order_intake_'))='research_health_quick_order_intake_' or p.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail')) loop
    if fn.proowner<>current_user::regrole::oid or fn.prokind<>'f'
      or fn.proconfig is distinct from array['search_path=""']::text[]
      or fn.prosecdef is distinct from (fn.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail'))
      or exists(select 1 from pg_catalog.aclexplode(coalesce(fn.proacl,pg_catalog.acldefault('f',fn.proowner))) a
        where a.grantee<>fn.proowner and (a.grantee<>'service_role'::regrole::oid
          or fn.proname not in ('research_health_quick_order_replay','research_health_quick_order_admin_detail')
          or a.privilege_type<>'EXECUTE' or a.is_grantable))
    then raise exception 'Quick Order function authority differs' using errcode='55000'; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if pg_catalog.has_function_privilege(role_name,fn.oid,'EXECUTE') is distinct from
        (role_name='service_role' and fn.proname in ('research_health_quick_order_replay','research_health_quick_order_admin_detail'))
      then raise exception 'Quick Order effective execute authority differs' using errcode='55000'; end if;
    end loop;
  end loop;

    raise notice 'QUICK_ORDER_INTAKE_PRECHECK: exact read-only surface; no atomic-intake proof';
  end if;
  if exists(select 1 from pg_catalog.pg_proc where pronamespace='public'::regnamespace
      and proname in ('research_health_quick_order_commit','research_health_quick_order_guard_source_write')) then
    raise exception 'Held Quick Order write surface unexpectedly exists' using errcode='55000';
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
      ('research_assisted_order_events','research_assisted_order_events_append_only','A'),
      ('research_assisted_order_events','research_assisted_order_paid_event_evidence','A'),
      ('research_assisted_order_events','hl12_disposition_cancel_event','O'),
      ('research_assisted_order_events','adp03_paid_event','A'),
      ('research_notification_outbox','hl12_payment_effects_outbox_guard','A'),
      ('research_notification_outbox','hl12_payment_effects_outbox_truncate','A'),
      ('research_notification_outbox','hl12_disposition_effects_outbox','O'),
      ('research_notification_outbox','hl12_disposition_effects_truncate','O')
    ), actual as (
      select c.relname::text relation_name,t.tgname::text trigger_name,t.tgenabled::text enabled
      from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
      where c.relnamespace='public'::regnamespace and not t.tgisinternal
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
