-- =====================================================================
-- SUPERVISED PILOT, PRODUCTION FOUNDATION CHECK
--
-- ENTIRELY READ-ONLY. No INSERT, UPDATE, DELETE, CREATE, ALTER, DROP,
-- GRANT or REVOKE appears anywhere below. It seeds nothing, creates no
-- customer, and mints no verification token.
--
-- WHERE TO RUN IT
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Run it against the PRODUCTION project.
--
-- THE ONE THING TO EDIT
--   Line marked "SAMUEL EDITS THIS LINE". Put the intended Early Access
--   test email between the quotes. It never leaves the SQL editor: every
--   result below reports counts and an opaque id PREFIX, never the
--   address itself, so the output is safe to copy back.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. WHERE AM I, AND IS MIGRATION 57 APPLIED
-- ---------------------------------------------------------------------
select
  'A. context and registry' as section,
  current_database()                       as database,
  current_user                             as running_as,
  current_timestamp                        as checked_at,
  (select count(*) from public.research_catalog_founder_locked_variant)
                                           as registry_rows,
  case (select count(*) from public.research_catalog_founder_locked_variant)
    when 78 then '78 = MIGRATION 57 APPLIED'
    when 70 then '70 = MIGRATION 57 NOT APPLIED'
    else 'UNEXPECTED COUNT, do not proceed, report this number'
  end                                      as verdict;

-- ---------------------------------------------------------------------
-- B. IDENTITY FOUNDATION (migration 50): do the objects exist
--
-- to_regclass / to_regprocedure return NULL when the object is absent,
-- and neither one reads a single row, so this answers "is it there"
-- without touching the data.
-- ---------------------------------------------------------------------
select 'B. identity foundation' as section, object, kind,
       case when present then 'PRESENT' else 'MISSING' end as state
from (
  values
    ('research_early_access_customers', 'relation',
      to_regclass('public.research_early_access_customers') is not null),
    ('research_early_access_session_bindings', 'relation',
      to_regclass('public.research_early_access_session_bindings') is not null),
    ('research_early_access_agreement_acceptances', 'relation',
      to_regclass('public.research_early_access_agreement_acceptances') is not null),
    ('research_early_access_record_agreement', 'function',
      exists (select 1 from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname = 'research_early_access_record_agreement')),
    ('research_early_access_agreements_accepted', 'function',
      exists (select 1 from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname = 'research_early_access_agreements_accepted'))
) as checks(object, kind, present);

-- ---------------------------------------------------------------------
-- C. THE APPROVED TEST CUSTOMER
--
-- Expected: matching 1, approved 1, duplicates 0.
-- If matching is 0, STOP. Do not create the row from here; it is created
-- through the governed admin route.
-- ---------------------------------------------------------------------
with target as (
  select lower(trim(
    'PUT_THE_TEST_EMAIL_HERE'   -- <<< SAMUEL EDITS THIS LINE
  )) as normalized_email
)
select
  'C. approved customer' as section,
  (select count(*) from public.research_early_access_customers c, target t
     where c.normalized_email = t.normalized_email)              as matching_count,
  (select count(*) from public.research_early_access_customers c, target t
     where c.normalized_email = t.normalized_email
       and c.status = 'APPROVED')                                as approved_count,
  -- Any second row for the same address. The unique constraint should
  -- make this impossible; it is checked rather than assumed.
  (select greatest(count(*) - 1, 0) from public.research_early_access_customers c, target t
     where c.normalized_email = t.normalized_email)              as duplicate_count,
  -- Opaque, and truncated. Enough to tell two rows apart in a report,
  -- not enough to be an identifier on its own.
  (select string_agg(left(c.id, 8) || '...', ', ' order by c.created_at)
     from public.research_early_access_customers c, target t
     where c.normalized_email = t.normalized_email)              as customer_id_prefixes,
  (select string_agg(c.status, ', ' order by c.created_at)
     from public.research_early_access_customers c, target t
     where c.normalized_email = t.normalized_email)              as statuses;

-- Roster shape overall, so a near-miss address is visible as a count
-- without any address being displayed.
select
  'C2. roster totals' as section,
  count(*)                                            as customers_total,
  count(*) filter (where status = 'APPROVED')         as approved_total,
  count(*) filter (where status = 'INVITED')          as invited_total,
  count(*) filter (where status in ('SUSPENDED','REVOKED')) as withdrawn_total
from public.research_early_access_customers;

-- ---------------------------------------------------------------------
-- D. SHIPPING ALLOWLIST
--
-- Empty means NOWHERE is served: the policy fails closed by shape, so a
-- correct-price order smoke would refuse with SHIPPING_UNAVAILABLE.
-- Country codes are not personal data; the destination is not shown.
-- ---------------------------------------------------------------------
select
  'D. shipping allowlist' as section,
  count(*) filter (where active)                                   as active_regions,
  coalesce(string_agg(country || coalesce('/' || region, ''), ', ')
           filter (where active), '(none)')                        as active_list,
  case when count(*) filter (where active) = 0
       then 'EMPTY: nowhere is served. Seed only via research_early_access_allow_shipping_region(...), which is a governed write and is NOT part of this check.'
       else 'Populated. Confirm the intended destination appears above.'
  end                                                              as verdict
from public.research_early_access_shipping_regions;

-- ---------------------------------------------------------------------
-- E. SUPPLIER CONFIRMATIONS
--
-- 22 units is the accepted opening set. Cagrilintide is held by founder
-- decision and does carry a confirmation, so coverage is about supply,
-- not about purchasability.
-- ---------------------------------------------------------------------
select
  'E. supplier confirmations' as section,
  count(*) filter (where status = 'active')                        as active_confirmations,
  count(distinct (product_id, variant_id)) filter (where status = 'active')
                                                                   as distinct_units_covered,
  min(expires_at) filter (where status = 'active')                 as earliest_expiry,
  count(*) filter (
    where status = 'active'
      and expires_at is not null
      and expires_at < timestamptz '2026-09-03 00:00:00+00'
  )                                                                as expiring_before_2026_09_03,
  case
    when count(distinct (product_id, variant_id)) filter (where status = 'active') >= 22
      then 'All 22 units covered'
    else 'NOT all 22 units covered, report the number above'
  end                                                              as coverage_verdict
from public.research_early_access_supplier_confirmations;
