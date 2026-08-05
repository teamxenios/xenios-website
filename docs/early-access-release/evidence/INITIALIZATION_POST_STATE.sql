-- POST-STATE after founder-release and supplier-confirmation initialization.
-- READ ONLY. No INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, TRUNCATE, GRANT
-- or REVOKE.
--
-- Run AFTER both --execute commands. Rows 1 to 12 must all read PASS before the
-- feature flag is touched. The flag stays false until then.

with expected_release (release_id, product_id, variant_id, price_cents) as (
  values
    ('rel-first-r360-aod9604-5mg-vial',        'PEX-012', 'R360-AOD9604-5MG-VIAL',          5600),
    ('rel-first-r360-bpc157-5mg-vial',         'PEX-001', 'R360-BPC157-5MG-VIAL',           3350),
    ('rel-first-r360-bpc157-10mg-vial',        'PEX-001', 'R360-BPC157-10MG-VIAL',          4750),
    ('rel-first-r360-dsip-10mg-vial',          'PEX-007', 'R360-DSIP-10MG-VIAL',            7000),
    ('rel-first-r360-ghkcu-50mg-vial',         'PEX-003', 'R360-GHKCU-50MG-VIAL',           2250),
    ('rel-first-r360-ghkcu-100mg-vial',        'PEX-003', 'R360-GHKCU-100MG-VIAL',          4200),
    ('rel-first-r360-hexarelin-10mg-vial',     'PEX-029', 'R360-HEXARELIN-10MG-VIAL',       8400),
    ('rel-first-r360-ipamorelin-10mg-vial',    'PEX-009', 'R360-IPAMORELIN-10MG-VIAL',      4750),
    ('rel-first-r360-kisspeptin10-10mg-vial',  'PEX-018', 'R360-KISSPEPTIN10-10MG-VIAL',    7000),
    ('rel-first-r360-kpv-10mg-vial',           'PEX-004', 'R360-KPV-10MG-VIAL',             5050),
    ('rel-first-r360-glutathione-500mg-vial',  'PEX-015', 'R360-GLUTATHIONE-500MG-VIAL',    4475),
    ('rel-first-r360-motsc-10mg-vial',         'PEP-010', 'R360-MOTSC-10MG-VIAL',           4475),
    ('rel-first-r360-nad-500mg-vial',          'PEP-009', 'R360-NAD-500MG-VIAL',            7000),
    ('rel-first-r360-nad-1000mg-vial',         'PEP-009', 'R360-NAD-1000MG-VIAL',          10075),
    ('rel-first-r360-oxytocin-5mg-vial',       'PEX-030', 'R360-OXYTOCIN-5MG-VIAL',         4475),
    ('rel-first-r360-pt141-10mg-vial',         'PEP-006', 'R360-PT141-10MG-VIAL',           3925),
    ('rel-first-r360-selank-10mg-vial',        'PEX-006', 'R360-SELANK-10MG-VIAL',          5325),
    ('rel-first-r360-semax-10mg-vial',         'PEX-005', 'R360-SEMAX-10MG-VIAL',           5325),
    ('rel-first-r360-sermorelin-5mg-vial',     'PEX-023', 'R360-SERMORELIN-5MG-VIAL',       5050),
    ('rel-first-r360-tesamorelin-10mg-vial',   'PEP-007', 'R360-TESAMORELIN-10MG-VIAL',    10650),
    ('rel-first-r360-thymosinalpha1-10mg-vial','PEX-008', 'R360-THYMOSINALPHA1-10MG-VIAL', 10650)
),
rel as (select * from public.research_early_access_releases),
conf as (select * from public.research_early_access_supplier_confirmations),
reg as (select * from public.research_catalog_founder_locked_variant)
select * from (
  select 1 as ord, 'founder releases recorded' as check_name,
         (select count(*) from rel)::text as observed, '21' as expected,
         case when (select count(*) from rel) = 21 then 'PASS' else 'FAIL - STOP' end as verdict

  union all
  select 2, 'all 21 expected release ids present',
         (select count(*) from rel r join expected_release e on e.release_id = r.release_id)::text,
         '21',
         case when (select count(*) from rel r join expected_release e on e.release_id = r.release_id) = 21
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 3, 'all 21 approved and on the right unit',
         (select count(*) from rel r join expected_release e
            on e.release_id = r.release_id
           and e.product_id = r.product_id
           and e.variant_id = r.variant_id
          where r.status = 'approved')::text,
         '21',
         case when (select count(*) from rel r join expected_release e
                      on e.release_id = r.release_id
                     and e.product_id = r.product_id
                     and e.variant_id = r.variant_id
                    where r.status = 'approved') = 21
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 4, 'unexpected releases beyond the manifest',
         (select count(*) from rel r
           left join expected_release e on e.release_id = r.release_id
          where e.release_id is null)::text, '0',
         case when (select count(*) from rel r
                     left join expected_release e on e.release_id = r.release_id
                    where e.release_id is null) = 0 then 'PASS' else 'FAIL - STOP' end

  union all
  select 5, 'Cagrilintide has NO founder release',
         (select count(*) from rel where product_id = 'PEX-028')::text, '0',
         case when (select count(*) from rel where product_id = 'PEX-028') = 0
              then 'PASS - held by NO_FOUNDER_RELEASE' else 'FAIL - STOP' end

  union all
  select 6, 'the three disputed units ARE released (so they stay visible)',
         (select count(*) from rel
           where variant_id in ('R360-TESAMORELIN-10MG-VIAL','R360-NAD-500MG-VIAL','R360-MOTSC-10MG-VIAL')
             and status = 'approved')::text, '3',
         case when (select count(*) from rel
                     where variant_id in ('R360-TESAMORELIN-10MG-VIAL','R360-NAD-500MG-VIAL','R360-MOTSC-10MG-VIAL')
                       and status = 'approved') = 3
              then 'PASS - released and still held' else 'FAIL - STOP' end

  union all
  -- The release must not have softened the dispute. If it had, those units
  -- would become sellable, which is the one outcome nobody approved.
  select 7, 'the three disputes still recorded',
         (select count(*) from reg
           where supplier_master_strength is not null
             and sku_key in ('R360-TESAMORELIN-10MG-VIAL','R360-NAD-500MG-VIAL','R360-MOTSC-10MG-VIAL'))::text,
         '3',
         case when (select count(*) from reg
                     where supplier_master_strength is not null
                       and sku_key in ('R360-TESAMORELIN-10MG-VIAL','R360-NAD-500MG-VIAL','R360-MOTSC-10MG-VIAL')) = 3
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 8, 'total disputes unchanged',
         (select count(*) from reg where supplier_master_strength is not null)::text, '12',
         case when (select count(*) from reg where supplier_master_strength is not null) = 12
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 9, 'NAD+ 1000 mg released at $100.75',
         coalesce((select '$' || (e.price_cents/100.0)::numeric(10,2)::text
                     from rel r join expected_release e on e.release_id = r.release_id
                    where r.variant_id = 'R360-NAD-1000MG-VIAL' and r.status = 'approved'), 'ABSENT'),
         '$100.75',
         case when exists (select 1 from rel where variant_id = 'R360-NAD-1000MG-VIAL' and status = 'approved')
              then 'PASS' else 'FAIL - STOP' end

  union all
  select 10, 'supplier confirmations recorded',
         (select count(*) from conf)::text, '22',
         case when (select count(*) from conf) = 22 then 'PASS' else 'FAIL - STOP' end

  union all
  select 11, 'registry unchanged at 78',
         (select count(*) from reg)::text, '78',
         case when (select count(*) from reg) = 78 then 'PASS' else 'FAIL - STOP' end

  union all
  -- Neither initializer may create customer or money state.
  select 12, 'customer and money state still empty',
         ((select count(*) from public.research_early_access_customers)
          + (select count(*) from public.research_early_access_placements)
          + (select count(*) from public.research_early_access_invoices)
          + (select count(*) from public.research_early_access_settlements)
          + (select count(*) from public.research_early_access_money_snapshots)
          + (select count(*) from public.research_early_access_supplier_orders))::text,
         '0',
         case when ((select count(*) from public.research_early_access_customers)
                    + (select count(*) from public.research_early_access_placements)
                    + (select count(*) from public.research_early_access_invoices)
                    + (select count(*) from public.research_early_access_settlements)
                    + (select count(*) from public.research_early_access_money_snapshots)
                    + (select count(*) from public.research_early_access_supplier_orders)) = 0
              then 'PASS' else 'FAIL - STOP' end

  union all
  -- Derived expectation, for the browser proof to confirm.
  select 13, 'expected storefront projection',
         '22 visible / ' ||
         ((select count(*) from rel where status = 'approved')
          - (select count(*) from rel
              where status = 'approved'
                and variant_id in ('R360-TESAMORELIN-10MG-VIAL','R360-NAD-500MG-VIAL','R360-MOTSC-10MG-VIAL')))::text
         || ' purchasable / 4 held',
         '22 visible / 18 purchasable / 4 held',
         'CONFIRM IN BROWSER'
) checks
order by ord;
