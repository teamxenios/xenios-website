-- Read-only release precondition checks; no recipient or payment data emitted.
do $check$
declare p record; v_role text; v_signature text;
begin
  if not exists(select 1 from pg_class where oid='public.research_notification_outbox'::regclass and relrowsecurity)
     or not exists(select 1 from pg_class where oid='public.research_assisted_order_audit_events_v1'::regclass and relrowsecurity and relforcerowsecurity) then
    raise exception 'Effects RLS guard absent';
  end if;
  foreach v_signature in array array[
    'public.research_assisted_order_payment_effects_audit_receipt(uuid)',
    'public.research_assisted_order_payment_effects_outbox_guard()',
    'public.research_assisted_order_payment_effects_capture()',
    'public.research_assisted_order_payment_effects_authority()',
    'public.research_assisted_order_payment_effects_context(uuid)',
    'public.research_assisted_order_payment_effects_pending(timestamptz,uuid,integer)',
    'public.research_assisted_order_payment_effects_complete(uuid,text,text,jsonb)',
    'public.research_assisted_order_payment_effects_outbox_ready(uuid,uuid,text,text,text,jsonb)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'Effects exact function signature absent';
    end if;
  end loop;
  for p in select oid,proname,prosecdef,proconfig,proacl,proowner from pg_proc
    where pronamespace='public'::regnamespace and proname like 'research_assisted_order_payment_effects_%' loop
    if p.prosecdef is distinct from true or ('search_path=""'=any(p.proconfig)) is distinct from true
       or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'Effects function privilege or search path drift';
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role,p.oid,'EXECUTE') is distinct from (v_role='service_role' and p.proname in (
        'research_assisted_order_payment_effects_authority','research_assisted_order_payment_effects_context',
        'research_assisted_order_payment_effects_pending','research_assisted_order_payment_effects_complete',
        'research_assisted_order_payment_effects_outbox_ready')) then
        raise exception 'Effects callable role drift';
      end if;
    end loop;
  end loop;
  if exists(select 1 from (values
      ('hl12_payment_effects_capture','public.research_assisted_order_payment_verifications'::regclass,
        'public.research_assisted_order_payment_effects_capture()'::regprocedure),
      ('hl12_payment_effects_outbox_guard','public.research_notification_outbox'::regclass,
        'public.research_assisted_order_payment_effects_outbox_guard()'::regprocedure),
      ('hl12_payment_effects_outbox_truncate','public.research_notification_outbox'::regclass,
        'public.research_assisted_order_payment_effects_outbox_guard()'::regprocedure)
    ) expected(trigger_name,relation_id,function_id) where not exists(
      select 1 from pg_trigger t where t.tgname=expected.trigger_name and t.tgrelid=expected.relation_id
        and t.tgfoid=expected.function_id and t.tgenabled in ('O','A') and not t.tgisinternal)) then
    raise exception 'Effects transaction trigger absent';
  end if;
  if exists(select 1 from public.research_assisted_order_payment_verifications v where not exists(
       select 1 from public.research_notification_outbox o where o.assisted_order_verification_id=v.id))
     or exists(select 1 from public.research_notification_outbox where assisted_order_verification_id is not null
       and created_at is distinct from date_trunc('milliseconds',created_at)) then
    raise exception 'Effects coverage or cursor precision drift';
  end if;
  if has_function_privilege('service_role','public.research_assisted_order_payment_verify(uuid,uuid)','EXECUTE')
     or exists(select 1 from public.research_assisted_order_payment_verifications where method='provider') then
    raise exception 'Prior verifier/provider hold drift';
  end if;
end
$check$;
select jsonb_build_object(
  'bound_intents',(select count(*) from public.research_notification_outbox where assisted_order_verification_id is not null),
  'held_intents',(select count(*) from public.research_notification_outbox where assisted_order_verification_id is not null and status='held'),
  'canonical_audit_events',(select count(*) from public.research_assisted_order_audit_events_v1),
  'complete_rpc_md5',md5(pg_get_functiondef('public.research_assisted_order_payment_effects_complete(uuid,text,text,jsonb)'::regprocedure)),
  'capture_rpc_md5',md5(pg_get_functiondef('public.research_assisted_order_payment_effects_capture()'::regprocedure)),
  'guard_rpc_md5',md5(pg_get_functiondef('public.research_assisted_order_payment_effects_outbox_guard()'::regprocedure))
)::text;
