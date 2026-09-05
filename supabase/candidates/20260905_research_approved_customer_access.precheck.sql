-- READ ONLY. Run against the selected production project before proposing GO.
-- Output schema and aggregate counts only; never export identity rows or secrets.
begin read only;
set local statement_timeout = '30s';
select current_database() as database_name, current_setting('server_version') as server_version;
do $$ begin
  if to_regclass('auth.users') is null or to_regclass('public.research_applications') is null
    or to_regclass('public.research_members') is null or to_regclass('public.research_application_events') is null
    or to_regclass('public.research_notification_outbox') is null then
    raise exception 'required canonical schema missing';
  end if;
  if exists(select lower(btrim(email)) from public.research_applications group by 1 having count(*)>1)
    or exists(select lower(btrim(email)) from public.research_members group by 1 having count(*)>1) then
    raise exception 'normalized account identities require reconciliation';
  end if;
end $$;

select table_schema,table_name,column_name,data_type,udt_name,is_nullable,column_default
from information_schema.columns
where (table_schema='auth' and table_name='users' and column_name in ('id','email','email_confirmed_at'))
  or (table_schema='public' and table_name in ('research_applications','research_members','research_application_events','research_notification_outbox'))
order by table_schema,table_name,ordinal_position;
select c.conrelid::regclass as relation,c.conname,c.contype,pg_get_constraintdef(c.oid) as definition
from pg_constraint c where c.conrelid in ('public.research_applications'::regclass,'public.research_members'::regclass,
  'public.research_application_events'::regclass,'public.research_notification_outbox'::regclass)
  or c.confrelid in ('public.research_applications'::regclass,'public.research_members'::regclass)
order by c.conrelid::regclass::text,c.conname;
select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname='public'
  and tablename in ('research_applications','research_members','research_application_events','research_notification_outbox') order by tablename,indexname;
select event_object_table,trigger_name,action_timing,event_manipulation,action_statement
from information_schema.triggers where event_object_schema='public'
  and event_object_table in ('research_applications','research_members','research_application_events','research_notification_outbox') order by event_object_table,trigger_name;
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public'
  and tablename in ('research_applications','research_members','research_application_events','research_notification_outbox') order by tablename,policyname;
select 'research_applications' as relation,count(*) as rows from public.research_applications
union all select 'research_members',count(*) from public.research_members
union all select 'research_application_events',count(*) from public.research_application_events
union all select 'research_notification_outbox',count(*) from public.research_notification_outbox;
-- Absence is expected before first apply; existing function definitions require
-- exact comparison with the selected candidate before replacement.
select p.oid::regprocedure as function,pg_get_functiondef(p.oid) as definition,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('research_approved_customer_access_authority',
  'research_admin_approve_customer_access','research_claim_approved_customer_access');
rollback;
