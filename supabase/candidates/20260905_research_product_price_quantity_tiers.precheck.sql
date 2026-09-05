-- READ ONLY. Obtain exact schema/ACL provenance before final candidate approval.
begin read only;
select current_database(), current_user, version();
select version from supabase_migrations.schema_migrations order by version;
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns where table_schema='public'
and table_name in ('research_product_prices','research_product_variants','research_product_admin_audit')
order by table_name, ordinal_position;
select p.oid::regprocedure as function_identity, p.proacl, p.prosecdef, p.proconfig,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('research_admin_create_product_price',
  'research_admin_approve_product_price','research_product_price_history_immutable',
  'research_admin_create_tiered_product_price','research_product_quantity_tiers_valid');
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.research_product_prices'::regclass;
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid='public.research_product_prices'::regclass and not tgisinternal;
rollback;
