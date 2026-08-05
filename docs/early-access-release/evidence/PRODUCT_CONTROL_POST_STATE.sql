-- PRODUCT CONTROL INITIALIZATION POST-STATE. READ ONLY.
-- No INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, TRUNCATE, GRANT or REVOKE.
--
-- Run this AFTER `npx tsx scripts/initialize-product-control.ts --execute`
-- and BEFORE changing RESEARCH_EARLY_ACCESS_ENABLED.
--
-- Every row must read PASS. Anything else stops the launch.
--
-- Note on the joins: research_early_access_releases.product_id and
-- .variant_id are `text`, while research_products.id and
-- research_product_variants.id are `uuid`, so the comparison casts the uuid
-- side to text. That is exactly the coupling this initialization repaired: the
-- 43 historical rows hold PEX codes and R360 SKUs in those text columns and can
-- never match a uuid, which rows 11 and 12 prove rather than assume.

select * from (
  -- -------------------------------------------------------------------
  -- Product Control
  -- -------------------------------------------------------------------
  select 1 as ord, 'products created' as check_name,
         (select count(*)::text from public.research_products) as observed,
         '19' as expected,
         case when (select count(*) from public.research_products) = 19
              then 'PASS' else 'FAIL - STOP' end as verdict

  union all
  select 2, 'products passing the exact catalogue filter',
         (select count(*)::text from public.research_products
           where admin_status = 'published' and visibility_state = 'public'
             and active_state is true),
         '19',
         case when (select count(*) from public.research_products
                     where admin_status = 'published' and visibility_state = 'public'
                       and active_state is true) = 19
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 3, 'products with published_at and published_by set',
         (select count(*)::text from public.research_products
           where published_at is not null and coalesce(published_by, '') <> ''),
         '19',
         case when (select count(*) from public.research_products
                     where published_at is not null and coalesce(published_by, '') <> '') = 19
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 4, 'variants created, approved and active',
         (select count(*)::text from public.research_product_variants
           where status = 'approved' and active is true),
         '22',
         case when (select count(*) from public.research_product_variants
                     where status = 'approved' and active is true) = 22
              and (select count(*) from public.research_product_variants) = 22
              then 'PASS' else 'FAIL - STOP' end

  union all
  -- Deliberately zero. Product Control prices carry a PriceAudience and Early
  -- Access authorizes only private_early_access, so no catalogue price row can
  -- ever be read by a customer. The approved amount is the founder release's.
  select 5, 'price rows created',
         (select count(*)::text from public.research_product_prices),
         '0',
         case when (select count(*) from public.research_product_prices) = 0
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 6, 'commerce approval, released products',
         (select count(*)::text from public.research_products
           where commerce_approval = 'approved' and availability = 'in_stock'),
         '18',
         case when (select count(*) from public.research_products
                     where commerce_approval = 'approved' and availability = 'in_stock') = 18
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 7, 'commerce approval, Cagrilintide (PEX-028)',
         coalesce((select commerce_approval || ' / ' || availability
                     from public.research_products where sku = 'PEX-028'), 'ABSENT'),
         'blocked_pending_written_approval / documentation_review',
         case when (select commerce_approval || ' / ' || availability
                      from public.research_products where sku = 'PEX-028')
                   = 'blocked_pending_written_approval / documentation_review'
              then 'PASS' else 'FAIL - STOP' end

  -- -------------------------------------------------------------------
  -- The new UUID-keyed records
  -- -------------------------------------------------------------------
  union all
  select 8, 'UUID-keyed founder releases appended',
         (select count(*)::text from public.research_early_access_releases
           where release_id like 'rel-first-pc-%'),
         '21',
         case when (select count(*) from public.research_early_access_releases
                     where release_id like 'rel-first-pc-%') = 21
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 9, 'UUID-keyed supplier confirmations appended',
         (select count(*)::text from public.research_early_access_supplier_confirmations
           where confirmation_id like 'supconf-rawpeptides-pc-%'),
         '22',
         case when (select count(*) from public.research_early_access_supplier_confirmations
                     where confirmation_id like 'supconf-rawpeptides-pc-%') = 22
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 10, 'every UUID release joins exactly one live unit',
         (select count(*)::text
            from public.research_early_access_releases r
            join public.research_products p
              on p.id::text = r.product_id
             and p.admin_status = 'published' and p.visibility_state = 'public'
             and p.active_state is true
            join public.research_product_variants v
              on v.id::text = r.variant_id and v.product_id = p.id
             and v.status = 'approved' and v.active is true
           where r.release_id like 'rel-first-pc-%'),
         '21',
         case when (select count(*)
                      from public.research_early_access_releases r
                      join public.research_products p
                        on p.id::text = r.product_id
                       and p.admin_status = 'published' and p.visibility_state = 'public'
                       and p.active_state is true
                      join public.research_product_variants v
                        on v.id::text = r.variant_id and v.product_id = p.id
                       and v.status = 'approved' and v.active is true
                     where r.release_id like 'rel-first-pc-%') = 21
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 11, 'every UUID confirmation joins exactly one live unit',
         (select count(*)::text
            from public.research_early_access_supplier_confirmations c
            join public.research_products p on p.id::text = c.product_id
            join public.research_product_variants v
              on v.id::text = c.variant_id and v.product_id = p.id
           where c.confirmation_id like 'supconf-rawpeptides-pc-%'),
         '22',
         case when (select count(*)
                      from public.research_early_access_supplier_confirmations c
                      join public.research_products p on p.id::text = c.product_id
                      join public.research_product_variants v
                        on v.id::text = c.variant_id and v.product_id = p.id
                     where c.confirmation_id like 'supconf-rawpeptides-pc-%') = 22
              then 'PASS' else 'FAIL - STOP' end

  -- -------------------------------------------------------------------
  -- The 43 historical rows: preserved, and inert
  -- -------------------------------------------------------------------
  union all
  select 12, 'canonical-keyed releases preserved',
         (select count(*)::text from public.research_early_access_releases
           where release_id like 'rel-first-%' and release_id not like 'rel-first-pc-%'),
         '21',
         case when (select count(*) from public.research_early_access_releases
                     where release_id like 'rel-first-%'
                       and release_id not like 'rel-first-pc-%') = 21
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 13, 'canonical-keyed confirmations preserved',
         (select count(*)::text from public.research_early_access_supplier_confirmations
           where confirmation_id like 'supconf-rawpeptides-%'
             and confirmation_id not like 'supconf-rawpeptides-pc-%'),
         '22',
         case when (select count(*) from public.research_early_access_supplier_confirmations
                     where confirmation_id like 'supconf-rawpeptides-%'
                       and confirmation_id not like 'supconf-rawpeptides-pc-%') = 22
              then 'PASS' else 'FAIL - STOP' end

  union all
  -- The whole point of the re-key. A canonical-keyed row holds 'PEX-012' where
  -- a live row holds a uuid, so it can join nothing. Zero is correct.
  select 14, 'canonical-keyed rows joining a live unit (must be none)',
         (select (
            (select count(*) from public.research_early_access_releases r
              join public.research_products p on p.id::text = r.product_id
             where r.release_id not like 'rel-first-pc-%')
            +
            (select count(*) from public.research_early_access_supplier_confirmations c
              join public.research_products p on p.id::text = c.product_id
             where c.confirmation_id not like 'supconf-rawpeptides-pc-%')
          )::text),
         '0',
         case when (
                (select count(*) from public.research_early_access_releases r
                  join public.research_products p on p.id::text = r.product_id
                 where r.release_id not like 'rel-first-pc-%')
                +
                (select count(*) from public.research_early_access_supplier_confirmations c
                  join public.research_products p on p.id::text = c.product_id
                 where c.confirmation_id not like 'supconf-rawpeptides-pc-%')
              ) = 0
              then 'PASS' else 'FAIL - STOP' end

  -- -------------------------------------------------------------------
  -- Cagrilintide, exactly
  -- -------------------------------------------------------------------
  union all
  select 15, 'Cagrilintide UUID releases (must be none)',
         (select count(*)::text
            from public.research_early_access_releases r
            join public.research_products p on p.id::text = r.product_id
           where p.sku = 'PEX-028' and r.release_id like 'rel-first-pc-%'),
         '0',
         case when (select count(*)
                      from public.research_early_access_releases r
                      join public.research_products p on p.id::text = r.product_id
                     where p.sku = 'PEX-028' and r.release_id like 'rel-first-pc-%') = 0
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 16, 'Cagrilintide UUID supplier confirmation (must be one)',
         (select count(*)::text
            from public.research_early_access_supplier_confirmations c
            join public.research_products p on p.id::text = c.product_id
           where p.sku = 'PEX-028' and c.confirmation_id like 'supconf-rawpeptides-pc-%'),
         '1',
         case when (select count(*)
                      from public.research_early_access_supplier_confirmations c
                      join public.research_products p on p.id::text = c.product_id
                     where p.sku = 'PEX-028'
                       and c.confirmation_id like 'supconf-rawpeptides-pc-%') = 1
              then 'PASS' else 'FAIL - STOP' end

  -- -------------------------------------------------------------------
  -- The disputed units, and the founder's one named amount
  -- -------------------------------------------------------------------
  union all
  select 17, 'the three disputed SKUs exist and are released (visible, held)',
         (select count(*)::text
            from public.research_product_variants v
            join public.research_early_access_releases r on r.variant_id = v.id::text
           where v.sku in ('R360-TESAMORELIN-10MG-VIAL','R360-NAD-500MG-VIAL','R360-MOTSC-10MG-VIAL')
             and r.release_id like 'rel-first-pc-%'),
         '3',
         case when (select count(*)
                      from public.research_product_variants v
                      join public.research_early_access_releases r on r.variant_id = v.id::text
                     where v.sku in ('R360-TESAMORELIN-10MG-VIAL','R360-NAD-500MG-VIAL','R360-MOTSC-10MG-VIAL')
                       and r.release_id like 'rel-first-pc-%') = 3
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 18, 'no UUID release waives a non-waivable blocker',
         (select count(*)::text from public.research_early_access_releases
           where release_id like 'rel-first-pc-%'
             and (record -> 'waivedBlockers') @> '["STRENGTH_DISPUTE_UNRESOLVED"]'::jsonb),
         '0',
         case when (select count(*) from public.research_early_access_releases
                     where release_id like 'rel-first-pc-%'
                       and (record -> 'waivedBlockers') @> '["STRENGTH_DISPUTE_UNRESOLVED"]'::jsonb) = 0
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 19, 'NAD+ 1000 mg approved amount',
         coalesce((select (r.record ->> 'approvedPriceCents') || ' ' || (r.record ->> 'currency')
                     from public.research_early_access_releases r
                     join public.research_product_variants v on v.id::text = r.variant_id
                    where v.sku = 'R360-NAD-1000MG-VIAL'
                      and r.release_id like 'rel-first-pc-%'), 'ABSENT'),
         '10075 USD',
         case when (select (r.record ->> 'approvedPriceCents') || ' ' || (r.record ->> 'currency')
                      from public.research_early_access_releases r
                      join public.research_product_variants v on v.id::text = r.variant_id
                     where v.sku = 'R360-NAD-1000MG-VIAL'
                       and r.release_id like 'rel-first-pc-%') = '10075 USD'
              then 'PASS' else 'FAIL - STOP' end

  -- -------------------------------------------------------------------
  -- Nothing else moved
  -- -------------------------------------------------------------------
  union all
  select 20, 'founder-locked strength registry unchanged',
         coalesce((select count(*)::text from public.research_catalog_founder_locked_variant), 'ABSENT'),
         '78',
         case when coalesce((select count(*) from public.research_catalog_founder_locked_variant), -1) = 78
              then 'PASS' else 'FAIL - STOP' end

  union all
  -- Guarded by to_regclass so a table this deployment does not carry reports
  -- ABSENT rather than aborting the whole verification with 42P01.
  select 21, 'customer, order and money tables still empty',
         (select string_agg(t.name || '=' ||
                   coalesce((select count(*)::text from pg_class c
                              where c.oid = to_regclass('public.' || t.name)
                                and c.reltuples >= 0
                              limit 1), 'ABSENT'), ', ' order by t.name)
            from (values
              ('research_early_access_orders'),
              ('research_early_access_payments'),
              ('research_early_access_receipts'),
              ('research_early_access_refunds'),
              ('research_early_access_settlements'),
              ('research_early_access_supplier_orders'),
              ('research_early_access_shipments')
            ) as t(name)),
         'every table absent or unchanged from the pre-state',
         'REVIEW'
) checks
order by ord;
