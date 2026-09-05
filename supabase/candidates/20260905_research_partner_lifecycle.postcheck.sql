-- READ ONLY. No partner, clearance, signature, training, certification or money probe.
begin read only;
set local statement_timeout='30s';
do $$ declare fn text; begin
  if (public.research_partner_lifecycle_authority()->>'schemaVersion') is distinct from 'partner_lifecycle_20260905' then
    raise exception 'partner lifecycle authority mismatch';
  end if;
  foreach fn in array array['public.research_partner_lifecycle_authority()','public.research_admin_partner_operation(uuid,jsonb)'] loop
    if has_function_privilege('anon',fn,'EXECUTE') or has_function_privilege('authenticated',fn,'EXECUTE')
      or not has_function_privilege('service_role',fn,'EXECUTE') then raise exception 'partner operation privilege mismatch'; end if;
  end loop;
  if exists(select 1 from public.research_partner_lifecycle_events where operation_key is not null and (operation_hash is null or operation_result is null)) then
    raise exception 'partner operation provenance incomplete';
  end if;
end $$;
select public.research_partner_lifecycle_authority() as authority;
select p.oid::regprocedure as function,p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('research_partner_lifecycle_authority','research_admin_partner_operation');
select indexname,indexdef from pg_indexes where schemaname='public' and indexname='research_partner_operation_once';
select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public'
  and table_name in ('research_partner_agreements','research_partner_training')
  and column_name in ('evidence_source','evidence_reference','reviewed_by_auth_user_id') order by table_name,column_name;
select 'research_partners' as relation,count(*) as rows from public.research_partners
union all select 'research_partner_agreements',count(*) from public.research_partner_agreements
union all select 'research_partner_training',count(*) from public.research_partner_training
union all select 'research_partner_lifecycle_events',count(*) from public.research_partner_lifecycle_events;
-- Immediately after apply these counts must equal the precheck. The candidate
-- itself creates no partner, evidence, audit operation, notification or money row.
rollback;
