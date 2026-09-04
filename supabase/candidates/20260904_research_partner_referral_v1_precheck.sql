-- READ ONLY. Candidate review, not permission to connect to or modify production.
-- Review EVERY result. Null objects, unexpected types/columns, absent constraints,
-- prior V1 objects, existing policies, or an unreviewed owner require reconciliation.
begin read only;
select current_user as reviewed_owner, rolsuper, rolbypassrls from pg_roles where rolname=current_user;
select object_name,to_regclass('public.'||object_name) as existing_object
from unnest(array['research_members','research_partners','research_partner_links','research_attribution_touches',
  'research_idempotency_keys','research_affiliate_customer_bindings','research_partner_referral_events']) object_name;
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public' and table_name in
 ('research_members','research_partners','research_partner_links','research_attribution_touches','research_idempotency_keys','research_affiliate_customer_bindings')
order by table_name,ordinal_position;
select c.relname,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('research_members','research_partners','research_partner_links','research_attribution_touches','research_idempotency_keys','research_affiliate_customer_bindings')
order by c.relname,k.conname;
select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename in
 ('research_members','research_partners','research_partner_links','research_attribution_touches','research_idempotency_keys','research_affiliate_customer_bindings') order by tablename,indexname;
select tablename,policyname,roles,cmd from pg_policies where schemaname='public' and tablename in
 ('research_partner_links','research_attribution_touches','research_idempotency_keys','research_affiliate_customer_bindings');
select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,pg_get_userbyid(p.proowner) as owner
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'research_referral_v1_%';
rollback;
