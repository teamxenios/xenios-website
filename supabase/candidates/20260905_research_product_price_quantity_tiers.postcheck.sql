-- READ ONLY. Every boolean must be true after a separately authorized application.
begin read only;
select count(*) = 0 as all_ladders_valid from public.research_product_prices
where not public.research_product_quantity_tiers_valid(amount_cents, quantity_tiers);
select exists(select 1 from pg_constraint where conrelid='public.research_product_prices'::regclass
  and conname='research_product_prices_quantity_tiers_valid' and convalidated) as constraint_valid;
select position('new.quantity_tiers is distinct from old.quantity_tiers' in
  pg_get_functiondef('public.research_product_price_history_immutable()'::regprocedure)) > 0 as economic_immutability;
select has_function_privilege('service_role','public.research_admin_create_tiered_product_price(uuid,jsonb,text,timestamptz)','execute') as service_can_execute,
  not has_function_privilege('anon','public.research_admin_create_tiered_product_price(uuid,jsonb,text,timestamptz)','execute') as anon_refused,
  not has_function_privilege('authenticated','public.research_admin_create_tiered_product_price(uuid,jsonb,text,timestamptz)','execute') as authenticated_refused;
rollback;
