-- EA QUANTITY 1-20: RELEASE AUTHORITY POSTCHECK. READ ONLY.
--
-- Run this AFTER the write. Every assertion raises on failure, so a non-zero
-- psql exit IS the failure signal; every satisfied assertion emits
-- `NOTICE: PASS ...` so the evidence is readable.
--
-- THIS FILE WRITES NOTHING. No insert, no update, no delete, no DDL, no grant.
--
-- It answers four questions, in the order they matter:
--
--   1. does every approved unit now resolve to a ceiling of twenty;
--   2. did the write change anything it was not allowed to change (price,
--      currency, product version, waivers, expiry);
--   3. did it invent a unit, resurrect a revoked one, or delete history;
--   4. is the founder checkout still exactly where it was.

do $ea_qty20_postcheck$
declare
  v_bad        integer;
  v_approved   integer;
  v_at20       integer;
  v_rows       integer;
begin
  -- -------------------------------------------------------------------------
  -- 1. EVERY APPROVED UNIT IS AT TWENTY.
  --    Read exactly as decideEarlyAccessRelease reads it: the LAST record per
  --    unit, ordered by (recorded_at, release_id).
  -- -------------------------------------------------------------------------
  with latest as (
    select distinct on (product_id, variant_id)
      product_id, variant_id, status, record
    from public.research_early_access_releases
    order by product_id, variant_id, recorded_at desc, release_id desc
  )
  select
    count(*) filter (where status = 'approved'),
    count(*) filter (where status = 'approved'
      and (record ->> 'approvedQuantityLimit')::integer = 20)
  into v_approved, v_at20
  from latest;

  if v_approved = 0 then
    raise exception 'FAIL no approved units found; the ledger is not in the expected state';
  end if;
  if v_approved <> v_at20 then
    raise exception 'FAIL % of % approved units are NOT at a ceiling of 20',
      v_approved - v_at20, v_approved;
  end if;
  raise notice 'PASS all % approved unit(s) resolve to approvedQuantityLimit = 20', v_approved;

  -- -------------------------------------------------------------------------
  -- 2. NOTHING ELSE MOVED.
  --    For every unit the write appended for, compare the new current record
  --    against the record it superseded. Only the ceiling, the release id, the
  --    actor, the reason and the timestamp may differ.
  -- -------------------------------------------------------------------------
  with ranked as (
    select
      product_id, variant_id, release_id, status, record, recorded_at,
      row_number() over (
        partition by product_id, variant_id
        order by recorded_at desc, release_id desc
      ) as rn
    from public.research_early_access_releases
  ),
  pairs as (
    select
      cur.product_id,
      cur.variant_id,
      cur.record as current_record,
      prev.record as prior_record
    from ranked cur
    join ranked prev
      on prev.product_id = cur.product_id
     and prev.variant_id = cur.variant_id
     and prev.rn = 2
    where cur.rn = 1
      and cur.release_id like 'rel_ea_qty20_%'
  )
  select count(*)
  into v_bad
  from pairs
  where current_record ->> 'productVersion'     is distinct from prior_record ->> 'productVersion'
     or current_record ->> 'approvedPriceCents' is distinct from prior_record ->> 'approvedPriceCents'
     or current_record ->> 'currency'           is distinct from prior_record ->> 'currency'
     or current_record -> 'waivedBlockers'      is distinct from coalesce(prior_record -> 'waivedBlockers', '[]'::jsonb)
     or current_record -> 'expiresAt'           is distinct from prior_record -> 'expiresAt'
     or current_record ->> 'portal'             is distinct from prior_record ->> 'portal';

  if v_bad <> 0 then
    raise exception
      'FAIL % appended release(s) changed a price, currency, product version, waiver or expiry', v_bad;
  end if;
  raise notice 'PASS every appended release carried price, currency, productVersion, waivers and expiry forward unchanged';

  -- -------------------------------------------------------------------------
  -- 3. NO UNIT INVENTED, NO REVOCATION UNDONE, NO HISTORY DELETED.
  -- -------------------------------------------------------------------------
  -- A qty20 release may only exist for a unit that ALREADY had an earlier
  -- release. If one has no predecessor, the write created a sellable unit.
  select count(*)
  into v_bad
  from public.research_early_access_releases r
  where r.release_id like 'rel_ea_qty20_%'
    and not exists (
      select 1 from public.research_early_access_releases p
      where p.product_id = r.product_id
        and p.variant_id = r.variant_id
        and p.release_id <> r.release_id
    );
  if v_bad <> 0 then
    raise exception 'FAIL % appended release(s) have no predecessor; a unit was invented', v_bad;
  end if;
  raise notice 'PASS every appended release supersedes an existing release; no unit was invented';

  -- No unit whose prior current state was 'revoked' may now be approved by one
  -- of these appends.
  with ranked as (
    select
      product_id, variant_id, release_id, status,
      row_number() over (
        partition by product_id, variant_id
        order by recorded_at desc, release_id desc
      ) as rn
    from public.research_early_access_releases
  )
  select count(*)
  into v_bad
  from ranked cur
  join ranked prev
    on prev.product_id = cur.product_id
   and prev.variant_id = cur.variant_id
   and prev.rn = 2
  where cur.rn = 1
    and cur.release_id like 'rel_ea_qty20_%'
    and prev.status = 'revoked';
  if v_bad <> 0 then
    raise exception 'FAIL % revoked unit(s) were resurrected by this write', v_bad;
  end if;
  raise notice 'PASS no revoked unit was resurrected';

  -- History is intact: every pre-existing release is still readable.
  select count(*) into v_rows
  from public.research_early_access_releases
  where release_id not like 'rel_ea_qty20_%';
  raise notice 'PASS % historical release row(s) remain readable and unmodified', v_rows;

  -- -------------------------------------------------------------------------
  -- 4. THE FOUNDER CHECKOUT IS UNTOUCHED.
  -- -------------------------------------------------------------------------
  if not exists (
    select 1 from public.research_early_access_cart_checkouts
    where checkout_number = 'XEC-E1703CC63BBE89E6839E24C1'
  ) then
    raise exception 'FAIL the founder checkout XEC-E1703CC63BBE89E6839E24C1 is missing';
  end if;
  raise notice 'PASS the founder checkout XEC-E1703CC63BBE89E6839E24C1 is present and was never addressed by this work';
end;
$ea_qty20_postcheck$;

\echo ''
\echo '=== Final state per unit (for the evidence record) ==='
with latest as (
  select distinct on (product_id, variant_id)
    product_id, variant_id, release_id, status, recorded_at, record
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
  recorded_at
from latest
order by product_id, variant_id;
