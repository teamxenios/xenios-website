-- EA QUANTITY 1-20: RELEASE AUTHORITY PRECHECK. READ ONLY.
--
-- Run this BEFORE the write. It answers, from production itself rather than
-- from anybody's memory, exactly which founder releases still cap a unit below
-- twenty and what the write would therefore touch.
--
-- THIS FILE WRITES NOTHING. No insert, no update, no delete, no DDL, no grant.
-- It is safe to run at any time, including while Early Access is live.
--
-- WHY THE LEDGER IS READ THIS WAY. public.research_early_access_releases is
-- APPEND ONLY, and the domain (decideEarlyAccessRelease) takes the current
-- state of a unit to be the LAST record written for it, ordered by
-- (recorded_at, release_id) with the release id breaking a timestamp tie. Every
-- query below therefore reduces to that same "latest per unit" rule. Reading
-- the ledger any other way, for example by max(approved_quantity_limit) or by
-- filtering on status alone, would answer a question the application never
-- asks.

\echo '=== 1. Ledger shape: total rows, distinct units, status spread ==='
select
  count(*)                                             as ledger_rows,
  count(distinct (product_id, variant_id))             as distinct_units,
  count(*) filter (where status = 'approved')          as approved_rows,
  count(*) filter (where status = 'revoked')           as revoked_rows
from public.research_early_access_releases;

\echo ''
\echo '=== 2. CURRENT state per unit (the latest record, exactly as the domain reads it) ==='
with latest as (
  select distinct on (product_id, variant_id)
    product_id,
    variant_id,
    release_id,
    status,
    recorded_at,
    record
  from public.research_early_access_releases
  order by product_id, variant_id, recorded_at desc, release_id desc
)
select
  product_id,
  variant_id,
  release_id,
  status,
  (record ->> 'approvedQuantityLimit')::integer as approved_quantity_limit,
  (record ->> 'approvedPriceCents')::bigint     as approved_price_cents,
  record ->> 'currency'                          as currency,
  record ->> 'expiresAt'                         as expires_at,
  recorded_at
from latest
order by product_id, variant_id;

\echo ''
\echo '=== 3. THE WRITE SET: units whose CURRENT release is approved and capped below 20 ==='
\echo '    (this is exactly the set EA_QUANTITY_20_RELEASE_AUTHORITY_WRITE.sql will append for)'
with latest as (
  select distinct on (product_id, variant_id)
    product_id, variant_id, release_id, status, recorded_at, record
  from public.research_early_access_releases
  order by product_id, variant_id, recorded_at desc, release_id desc
)
select
  product_id,
  variant_id,
  release_id                                     as current_release_id,
  (record ->> 'approvedQuantityLimit')::integer  as current_limit,
  20                                             as intended_limit
from latest
where status = 'approved'
  and coalesce((record ->> 'approvedQuantityLimit')::integer, 0) <> 20
order by product_id, variant_id;

\echo ''
\echo '=== 4. Counts the postcheck will be compared against ==='
with latest as (
  select distinct on (product_id, variant_id)
    product_id, variant_id, status, record
  from public.research_early_access_releases
  order by product_id, variant_id, recorded_at desc, release_id desc
)
select
  count(*) filter (where status = 'approved')                                             as approved_units,
  count(*) filter (where status = 'revoked')                                              as revoked_units,
  count(*) filter (where status = 'approved'
    and (record ->> 'approvedQuantityLimit')::integer = 20)                               as approved_units_at_20,
  count(*) filter (where status = 'approved'
    and coalesce((record ->> 'approvedQuantityLimit')::integer, 0) <> 20)                 as approved_units_to_widen
from latest;

\echo ''
\echo '=== 5. EXPECTATIONS THE WRITE DEPENDS ON (each must read t) ==='
-- Every currently approved release must carry the fields the write copies
-- verbatim. A null in any of them means the write would produce an invalid
-- release, so it must abort rather than append a record the domain refuses.
with latest as (
  select distinct on (product_id, variant_id)
    product_id, variant_id, status, record
  from public.research_early_access_releases
  order by product_id, variant_id, recorded_at desc, release_id desc
)
select
  bool_and(record ? 'productVersion')      as every_approved_has_product_version,
  bool_and(record ? 'approvedPriceCents')  as every_approved_has_price,
  bool_and(record ? 'currency')            as every_approved_has_currency,
  bool_and(record ? 'waivedBlockers')      as every_approved_has_waived_blockers,
  bool_and(record ? 'actor')               as every_approved_has_actor,
  bool_and(record ->> 'portal' = 'private_early_access') as every_approved_is_ea_portal
from latest
where status = 'approved';

\echo ''
\echo '=== 6. The founder checkout must be visible and untouched by any of this ==='
-- Named only to make it obvious in the evidence that this work does not go
-- near it. The release ledger and the checkout tables are unrelated.
--
-- `disposition` is read through to_jsonb rather than as a bare column on
-- purpose. It is added by M61, and a precheck is exactly the kind of file that
-- gets run against a restored snapshot or a staging database that predates it.
-- A bare reference errors out there and takes the whole read-only report with
-- it; through to_jsonb an absent column reads as null, which is the truthful
-- answer to "what disposition does it have".
select
  checkout_number,
  payment_state,
  coalesce(to_jsonb(c) ->> 'disposition', 'active') as disposition
from public.research_early_access_cart_checkouts c
where checkout_number = 'XEC-E1703CC63BBE89E6839E24C1';
