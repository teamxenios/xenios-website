-- PRE-STATE for release-and-supply initialization. READ ONLY.
-- No INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, TRUNCATE, GRANT or REVOKE.
--
-- Establishes that production is in the clean pre-initialization state, so the
-- 21 releases and 22 supplier confirmations in the dry-run manifest would be
-- created fresh rather than colliding with, or silently overwriting, existing
-- rows.

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
)
select * from (
  select 1 as ord, 'expected release rows in the manifest' as check_name,
         (select count(*) from expected_release)::text as observed, '21' as expected,
         case when (select count(*) from expected_release) = 21 then 'PASS' else 'FAIL' end as verdict

  union all
  select 2, 'release ledger rows currently present',
         (select count(*) from public.research_early_access_releases)::text, '0',
         case when (select count(*) from public.research_early_access_releases) = 0
              then 'PASS - clean' else 'REVIEW - not empty' end

  union all
  -- Idempotency: none of the 21 release ids may already exist.
  select 3, 'manifest release ids already present',
         (select count(*) from public.research_early_access_releases r
           join expected_release e on e.release_id = r.release_id)::text, '0',
         case when (select count(*) from public.research_early_access_releases r
                     join expected_release e on e.release_id = r.release_id) = 0
              then 'PASS' else 'ALREADY INITIALIZED - STOP' end

  union all
  -- Cagrilintide must never appear in the manifest, and must have no release.
  select 4, 'Cagrilintide in the release manifest',
         (select count(*) from expected_release where product_id = 'PEX-028')::text, '0',
         case when (select count(*) from expected_release where product_id = 'PEX-028') = 0
              then 'PASS - correctly excluded' else 'FAIL - STOP' end

  union all
  select 5, 'Cagrilintide releases in production',
         (select count(*) from public.research_early_access_releases where product_id = 'PEX-028')::text, '0',
         case when (select count(*) from public.research_early_access_releases
                     where product_id = 'PEX-028') = 0 then 'PASS' else 'FAIL - STOP' end

  union all
  select 6, 'supplier confirmation rows currently present',
         (select count(*) from public.research_early_access_supplier_confirmations)::text, '0',
         case when (select count(*) from public.research_early_access_supplier_confirmations) = 0
              then 'PASS - clean' else 'REVIEW - not empty' end

  union all
  -- The three disputed units ARE released and priced. Their hold comes from the
  -- strength registry, not from withholding a release.
  select 7, 'disputed units present in the release manifest',
         (select count(*) from expected_release
           where variant_id in ('R360-TESAMORELIN-10MG-VIAL','R360-NAD-500MG-VIAL','R360-MOTSC-10MG-VIAL'))::text,
         '3',
         case when (select count(*) from expected_release
                     where variant_id in ('R360-TESAMORELIN-10MG-VIAL','R360-NAD-500MG-VIAL','R360-MOTSC-10MG-VIAL')) = 3
              then 'PASS - released but held by dispute' else 'FAIL - STOP' end

  union all
  select 8, 'NAD+ 1000 mg price in the manifest',
         (select '$' || (price_cents/100.0)::numeric(10,2)::text from expected_release
           where variant_id = 'R360-NAD-1000MG-VIAL'), '$100.75',
         case when (select price_cents from expected_release
                     where variant_id = 'R360-NAD-1000MG-VIAL') = 10075
              then 'PASS' else 'FAIL - STOP' end

  union all
  -- Every manifest variant must be a registered, catalog-known unit.
  select 9, 'manifest variants missing from the strength registry',
         (select count(*) from expected_release e
           left join public.research_catalog_founder_locked_variant v on v.sku_key = e.variant_id
          where v.sku_key is null)::text, '0',
         case when (select count(*) from expected_release e
                     left join public.research_catalog_founder_locked_variant v on v.sku_key = e.variant_id
                    where v.sku_key is null) = 0 then 'PASS' else 'FAIL - STOP' end

  union all
  select 10, 'customer state still empty',
         ((select count(*) from public.research_early_access_customers)
          + (select count(*) from public.research_early_access_placements)
          + (select count(*) from public.research_early_access_invoices))::text, '0',
         case when ((select count(*) from public.research_early_access_customers)
                    + (select count(*) from public.research_early_access_placements)
                    + (select count(*) from public.research_early_access_invoices)) = 0
              then 'PASS' else 'REVIEW' end
) checks
order by ord;
