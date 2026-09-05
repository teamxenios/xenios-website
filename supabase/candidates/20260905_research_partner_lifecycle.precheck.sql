-- READ ONLY. Schema/ACL and aggregate facts only; no identity or evidence rows.
begin read only;
set local statement_timeout='30s';
select current_database() as database_name,current_setting('server_version') as server_version;
do $$ begin
  if to_regclass('auth.users') is null or to_regclass('public.research_members') is null
    or to_regclass('public.research_partners') is null or to_regclass('public.research_partner_agreements') is null
    or to_regclass('public.research_partner_training') is null or to_regclass('public.research_partner_lifecycle_events') is null then
    raise exception 'canonical partner schema missing';
  end if;
  if exists(select member_id from public.research_partners group by member_id having count(*)>1) then
    raise exception 'duplicate canonical partner binding requires review';
  end if;
end $$;
select table_schema,table_name,column_name,data_type,udt_name,is_nullable,column_default
from information_schema.columns where table_schema='public' and table_name in
  ('research_members','research_partners','research_partner_agreements','research_partner_training','research_partner_lifecycle_events')
order by table_name,ordinal_position;
select c.conrelid::regclass as relation,c.conname,c.contype,pg_get_constraintdef(c.oid) as definition
from pg_constraint c where c.conrelid in ('public.research_members'::regclass,'public.research_partners'::regclass,
  'public.research_partner_agreements'::regclass,'public.research_partner_training'::regclass,'public.research_partner_lifecycle_events'::regclass)
  or c.confrelid in ('public.research_members'::regclass,'public.research_partners'::regclass)
order by c.conrelid::regclass::text,c.conname;
select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename in
  ('research_members','research_partners','research_partner_agreements','research_partner_training','research_partner_lifecycle_events') order by tablename,indexname;
select event_object_table,trigger_name,action_timing,event_manipulation,action_statement
from information_schema.triggers where event_object_schema='public' and event_object_table in
  ('research_members','research_partners','research_partner_agreements','research_partner_training','research_partner_lifecycle_events') order by event_object_table,trigger_name;
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in
  ('research_members','research_partners','research_partner_agreements','research_partner_training','research_partner_lifecycle_events') order by tablename,policyname;
select p.oid::regprocedure as function,p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('research_partner_lifecycle_authority','research_admin_partner_operation');
select 'research_partners' as relation,count(*) as rows from public.research_partners
union all select 'research_partner_agreements',count(*) from public.research_partner_agreements
union all select 'research_partner_training',count(*) from public.research_partner_training
union all select 'research_partner_lifecycle_events',count(*) from public.research_partner_lifecycle_events;
rollback;
