-- READ ONLY after separately authorized candidate apply. No customer/visitor rows.
begin read only;
select public.research_referral_v1_authority();
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('research_affiliate_customer_bindings','research_partner_referral_events');
select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'research_referral_v1_%' order by p.proname;
select tgname,tgenabled from pg_trigger where tgname like 'referral_v1_%' order by tgname;
select 'links' as relation,referral_version,count(*) from public.research_partner_links group by referral_version
union all select 'touches',referral_version,count(*) from public.research_attribution_touches group by referral_version
union all select 'bindings',referral_version,count(*) from public.research_affiliate_customer_bindings group by referral_version;
rollback;
