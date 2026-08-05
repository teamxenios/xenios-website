-- PRODUCT CONTROL CATALOGUE STATE (corrected). READ ONLY.
-- No INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, TRUNCATE, GRANT or REVOKE.
--
-- Every column below was confirmed against information_schema. The earlier
-- version guessed `active` and `product_code`; neither exists on
-- research_products. Identity is `sku`/`slug`, and activation is `active_state`.
--
-- The catalogue reads Product Control through:
--   repository.list({ status: "published", visibility: "public" })
-- which filters admin_status = 'published' AND visibility_state = 'public',
-- then keeps only rows where active_state is true (applied in TypeScript).

select * from (
  select 1 as ord, 'total products' as check_name,
         (select count(*)::text from public.research_products) as observed,
         'more than 0' as expected,
         case when (select count(*) from public.research_products) > 0
              then 'PASS' else 'TABLE EMPTY - STOP' end as verdict

  union all
  select 2, 'products passing the exact catalogue filter',
         (select count(*)::text from public.research_products
           where admin_status = 'published' and visibility_state = 'public'
             and active_state is true),
         '19 for the Early Access set',
         case when (select count(*) from public.research_products
                     where admin_status = 'published' and visibility_state = 'public'
                       and active_state is true) = 0
              then 'ZERO - this is the cause' else 'REVIEW' end

  -- Which of the three conditions fails, counted separately across all products.
  union all
  select 3, 'products by admin_status',
         (select string_agg(s, ', ' order by s) from (
            select admin_status || '=' || count(*)::text as s
            from public.research_products group by admin_status) t),
         'published for the 19', 'REVIEW'

  union all
  select 4, 'products by visibility_state',
         (select string_agg(s, ', ' order by s) from (
            select visibility_state || '=' || count(*)::text as s
            from public.research_products group by visibility_state) t),
         'public for the 19', 'REVIEW'

  union all
  select 5, 'products by active_state',
         (select string_agg(s, ', ' order by s) from (
            select active_state::text || '=' || count(*)::text as s
            from public.research_products group by active_state) t),
         'true for the 19', 'REVIEW'

  union all
  -- Variants default to active=false and status='draft', so publishing the
  -- product alone may still project no unit.
  select 6, 'total variants',
         (select count(*)::text from public.research_product_variants),
         '22 or more', 'REVIEW'

  union all
  select 7, 'variants by active',
         (select string_agg(s, ', ' order by s) from (
            select active::text || '=' || count(*)::text as s
            from public.research_product_variants group by active) t),
         'true for the 22', 'REVIEW'

  union all
  select 8, 'variants by status',
         (select string_agg(s, ', ' order by s) from (
            select status || '=' || count(*)::text as s
            from public.research_product_variants group by status) t),
         'published or active for the 22', 'REVIEW'

  union all
  select 9, 'total price rows',
         (select count(*)::text from public.research_product_prices),
         'more than 0', 'REVIEW'

  union all
  select 10, 'price rows by status',
         coalesce((select string_agg(s, ', ' order by s) from (
            select status || '=' || count(*)::text as s
            from public.research_product_prices group by status) t), 'none'),
         'approved for the sellable set', 'REVIEW'

  union all
  -- Not part of the catalogue filter, but it gates purchasability downstream
  -- and defaults to blocked, so it is measured now rather than later.
  select 11, 'products by commerce_approval',
         (select string_agg(s, ', ' order by s) from (
            select commerce_approval || '=' || count(*)::text as s
            from public.research_products group by commerce_approval) t),
         'approved for the sellable set', 'REVIEW'

  union all
  select 12, 'sample product identities and states',
         coalesce((select string_agg(sku || ' [' || admin_status || '/' || visibility_state
                                     || '/' || active_state::text || ']', '  |  ')
                     from (select sku, admin_status, visibility_state, active_state
                             from public.research_products order by sku limit 4) t), 'none'),
         'identity format for the release join', 'REVIEW'
) checks
order by ord;
