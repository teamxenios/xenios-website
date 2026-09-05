-- READ ONLY. Selected launch prerequisites, definitions and ACLs; no row data.
begin read only;
set local statement_timeout='30s';
with selected_tables as (
  select unnest(array['research_applications','research_members','research_application_events',
    'research_notification_outbox','research_notification_attempts','research_partners',
    'research_partner_agreements','research_partner_training','research_partner_lifecycle_events',
    'research_partner_links','research_attribution_touches','research_idempotency_keys','research_affiliate_customer_bindings',
    'research_referral_v1_links','research_referral_v1_touches','research_referral_v1_bindings',
    'research_referral_v1_events','research_partner_referral_links','research_partner_referral_touches',
    'research_partner_referral_bindings','research_partner_referral_events','research_rate_limits']) as name
), selected_relations as (
  select c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in (select name from selected_tables)
), trigger_functions as (
  select distinct t.tgfoid from pg_trigger t where t.tgrelid in (select oid from selected_relations) and not t.tgisinternal
)
select jsonb_build_object(
  'observedAt',clock_timestamp(),'projectRef','yvzeduaxbwgcwllhywff',
  'database',current_database(),'serverVersion',current_setting('server_version'),
  'transactionReadOnly',current_setting('transaction_read_only'),
  'tables',(select coalesce(jsonb_agg(to_jsonb(r) order by r.name),'[]') from (
    select t.name,c.oid is not null as present,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,c.relacl::text as acl
    from selected_tables t left join selected_relations c on c.relname=t.name) r),
  'columns',(select coalesce(jsonb_agg(to_jsonb(r) order by r.table_name,r.ordinal_position),'[]') from (
    select table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
    from information_schema.columns where table_schema='public' and table_name in (select name from selected_tables)
    union all select table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
    from information_schema.columns where table_schema='auth' and table_name='users' and column_name in ('id','email','email_confirmed_at')) r),
  'constraints',(select coalesce(jsonb_agg(to_jsonb(r) order by r.relation,r.name),'[]') from (
    select c.conrelid::regclass::text as relation,c.conname as name,c.contype as type,pg_get_constraintdef(c.oid) as definition
    from pg_constraint c where c.conrelid in (select oid from selected_relations) or c.confrelid in (select oid from selected_relations)) r),
  'indexes',(select coalesce(jsonb_agg(to_jsonb(r) order by r.tablename,r.indexname),'[]') from (
    select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename in (select name from selected_tables)) r),
  'triggers',(select coalesce(jsonb_agg(to_jsonb(r) order by r.relation,r.name),'[]') from (
    select t.tgrelid::regclass::text as relation,t.tgname as name,pg_get_triggerdef(t.oid) as definition
    from pg_trigger t where t.tgrelid in (select oid from selected_relations) and not t.tgisinternal) r),
  'policies',(select coalesce(jsonb_agg(to_jsonb(r) order by r.tablename,r.policyname),'[]') from (
    select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in (select name from selected_tables)) r),
  'functions',(select coalesce(jsonb_agg(to_jsonb(r) order by r.signature),'[]') from (
    select p.oid::regprocedure::text as signature,p.prosecdef as security_definer,p.proconfig as config,p.proacl::text as acl,pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname in ('research_approved_customer_access_authority','research_admin_approve_customer_access',
      'research_claim_approved_customer_access','research_partner_lifecycle_authority','research_admin_partner_operation',
      'research_partner_referral_v1_lineage') or p.proname like 'research_referral_v1_%' or p.proname like 'research_rate_limit%'
      or p.proname like 'research_notification_%' or p.proname like 'research_outbox_%' or p.oid in (select tgfoid from trigger_functions))) r)
) as schema_evidence;
rollback;
