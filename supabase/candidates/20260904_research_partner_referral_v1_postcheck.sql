-- READ ONLY after separately authorized candidate apply. No customer/visitor rows.
begin read only;
do $final_capability$
declare
  v_touch jsonb:=pg_catalog.jsonb_build_object('touchId','00000000-0000-4000-8000-000000000005',
    'subjectKeyHash',pg_catalog.repeat('0',64),'actorAuthUserId','00000000-0000-4000-8000-000000000006');
  v_body text:=pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.research_referral_v1_execute(text,jsonb)'));
begin
  if public.research_referral_v1_authority() is distinct from
    '{"ok":true,"value":{"schemaVersion":"gen2_referral_v1_transfer_touch_20260921"}}'::jsonb
    or public.research_referral_v1_execute('attributionForTouch',v_touch) is distinct from
      '{"ok":true,"value":{"partnerId":null,"eligible":false}}'::jsonb
    or pg_catalog.strpos(v_body,'if p_operation=''transferBinding'' then')=0
    or pg_catalog.strpos(v_body,'insert into public.research_referral_binding_transfer_events')=0 then
    raise exception 'Referral final capability or operation drift';
  end if;
end $final_capability$;
select public.research_referral_v1_authority();
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('research_affiliate_customer_bindings','research_partner_referral_events',
  'research_referral_binding_transfer_events');
select p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,p.prosecdef,p.proconfig,
  pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'research_referral_v1_%' order by p.proname;
select tgname,tgenabled from pg_catalog.pg_trigger where tgname like 'referral_v1_%' order by tgname;
select 'links' as relation,referral_version,count(*) from public.research_partner_links group by referral_version
union all select 'touches',referral_version,count(*) from public.research_attribution_touches group by referral_version
union all select 'bindings',referral_version,count(*) from public.research_affiliate_customer_bindings group by referral_version
union all select 'transfers',null::smallint,count(*) from public.research_referral_binding_transfer_events;
rollback;
