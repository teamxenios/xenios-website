-- READ ONLY. No customer rows, Auth identities, mail or approval probes created.
begin read only;
set local statement_timeout = '30s';
do $$
declare fn text;
begin
  if (public.research_approved_customer_access_authority()->>'schemaVersion') is distinct from 'approved_customer_access_20260905' then
    raise exception 'approved customer authority version mismatch';
  end if;
  foreach fn in array array[
    'public.research_approved_customer_access_authority()',
    'public.research_admin_approve_customer_access(uuid,text,text,text,text,uuid,timestamptz,text)',
    'public.research_claim_approved_customer_access(uuid,uuid)'] loop
    if has_function_privilege('anon',fn,'EXECUTE') or has_function_privilege('authenticated',fn,'EXECUTE')
      or not has_function_privilege('service_role',fn,'EXECUTE') then
      raise exception 'approved customer function privilege mismatch';
    end if;
  end loop;
  if exists(select 1 from public.research_applications where access_approval_version<0
    or (status='approved_customer' and (access_approval_version<1 or access_approved_by is null or access_approved_at is null))) then
    raise exception 'customer approval provenance invalid';
  end if;
end $$;
select public.research_approved_customer_access_authority() as authority;
select p.oid::regprocedure as function,p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('research_approved_customer_access_authority','research_admin_approve_customer_access','research_claim_approved_customer_access');
select c.conrelid::regclass as relation,c.conname,pg_get_constraintdef(c.oid) as definition
from pg_constraint c where c.conname in ('research_applications_status_check','research_application_country_provenance',
  'research_customer_approval_provenance','research_members_access_basis_check');
select indexname,indexdef from pg_indexes where schemaname='public' and indexname in
  ('research_applications_normalized_email_uidx','research_members_normalized_email_uidx','research_account_operation_once');
select 'research_applications' as relation,count(*) as rows from public.research_applications
union all select 'research_members',count(*) from public.research_members
union all select 'research_application_events',count(*) from public.research_application_events
union all select 'research_notification_outbox',count(*) from public.research_notification_outbox;
-- These four counts must equal the corresponding precheck counts immediately
-- after schema apply. This migration itself creates no operational row.
rollback;
