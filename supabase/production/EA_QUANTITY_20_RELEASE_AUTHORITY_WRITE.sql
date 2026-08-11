-- EA QUANTITY 1-20: RELEASE AUTHORITY WRITE.
--
-- *** DO NOT RUN THIS UNTIL THE QUANTITY CANDIDATE HAS PASSED DEFENSIVE QA AND
-- *** FINAL REVIEW, AND SAMUEL HAS EXPLICITLY AUTHORIZED THIS EXACT FILE.
--
-- WHAT THIS DOES
--
-- Records the founder's quantity decision of 2026-08-11 (every currently
-- purchasable exact variant may be bought at one through twenty, current Early
-- Access included) as new founder releases.
--
-- WHY IT APPENDS RATHER THAN UPDATES
--
-- public.research_early_access_releases is APPEND ONLY by design: the comment on
-- the table says so, the only writer routine
-- (research_early_access_append_release) says "never an overwrite", and the
-- domain reads the current state of a unit as the LAST record written for it. A
-- founder release is a recorded decision, not a mutable setting. Updating the
-- 2026-08-04 rows in place would rewrite a decision that was truthfully made,
-- and would leave the ledger unable to say when the ceiling changed or who
-- changed it. So this appends ONE new approved release per affected unit, and
-- the old records stay exactly as they are.
--
-- WHAT IT COPIES VERBATIM, AND WHY
--
-- Everything except the quantity ceiling:
--
--   productVersion    copied, so staleness is UNCHANGED. A release whose
--                     productVersion does not equal the live fingerprint of the
--                     unit is held as RELEASE_STALE. Copying it means this write
--                     cannot make a stale unit sellable, and cannot make a
--                     currently sellable unit stale.
--   approvedPriceCents / currency   copied. THIS WRITE CHANGES NO PRICE.
--   waivedBlockers    copied. It waives nothing new, so it cannot make a held or
--                     planning-only unit purchasable.
--   expiresAt         copied, so an expiring release still expires when it did.
--
-- and it sets approvedQuantityLimit = 20.
--
-- WHAT IT WILL NOT TOUCH
--
--   * any unit whose CURRENT release is 'revoked' (a revoked unit stays revoked);
--   * any unit that has no release at all (this creates no new sellable unit);
--   * any unit already at 20 (so a re-run is a no-op);
--   * readiness, audience, supplier authority, inventory, price, or Product
--     Control in any form. None of those live in this table.
--
-- SAFETY
--
--   * one transaction; either every append lands or none does;
--   * a guard aborts if it would append for zero units (nothing to do) or for
--     more units than the ledger actually has approved, which would mean the
--     selection is wrong;
--   * release_id is derived deterministically from the unit, so running this
--     file twice appends nothing the second time (primary key collision is
--     avoided by the NOT EXISTS guard, and the run is a no-op once every unit
--     is already at 20).
--
-- The matching read-only precheck and postcheck are in this directory.

begin;

do $ea_qty20_write$
declare
  v_recorded_at constant timestamptz := now();
  v_actor       constant text := 'Samuel Boadu';
  v_reason      constant text :=
    'Founder quantity decision, 2026-08-11: every currently purchasable exact '
    || 'variant may be purchased at one through twenty units per order, current '
    || 'Early Access included. Price, waivers, product version and expiry are '
    || 'carried forward unchanged from the release this supersedes; only the '
    || 'per-order quantity ceiling changes.';
  v_candidates integer;
  v_approved   integer;
  v_appended   integer;
begin
  -- The units this write is for: current record is approved and not yet at 20.
  create temporary table ea_qty20_targets on commit drop as
  with latest as (
    select distinct on (product_id, variant_id)
      product_id, variant_id, release_id, status, recorded_at, record
    from public.research_early_access_releases
    order by product_id, variant_id, recorded_at desc, release_id desc
  )
  select
    product_id,
    variant_id,
    release_id as superseded_release_id,
    record     as prior
  from latest
  where status = 'approved'
    and coalesce((record ->> 'approvedQuantityLimit')::integer, 0) <> 20;

  select count(*) into v_candidates from ea_qty20_targets;

  with latest as (
    select distinct on (product_id, variant_id) status
    from public.research_early_access_releases
    order by product_id, variant_id, recorded_at desc, release_id desc
  )
  select count(*) into v_approved from latest where status = 'approved';

  if v_candidates = 0 then
    raise notice 'EA-QTY20: every approved unit is already at 20. Nothing to do.';
    return;
  end if;

  if v_candidates > v_approved then
    raise exception
      'EA-QTY20 refused: % candidates exceeds % approved units; the selection is wrong',
      v_candidates, v_approved
      using errcode = '55000';
  end if;

  -- Every field the domain validates must be present, or the appended record
  -- would be one validateEarlyAccessRelease refuses on read.
  if exists (
    select 1 from ea_qty20_targets
    where prior ->> 'productVersion' is null
       or prior ->> 'approvedPriceCents' is null
       or prior ->> 'currency' is null
       or prior -> 'waivedBlockers' is null
       or prior ->> 'portal' is distinct from 'private_early_access'
  ) then
    raise exception
      'EA-QTY20 refused: a target release is missing a field this write must carry forward'
      using errcode = '55000';
  end if;

  insert into public.research_early_access_releases
    (release_id, product_id, variant_id, status, recorded_at, record)
  select
    t.release_id,
    t.product_id,
    t.variant_id,
    'approved',
    v_recorded_at,
    jsonb_build_object(
      'releaseId',             t.release_id,
      'portal',                'private_early_access',
      'productId',             t.product_id,
      'variantId',             t.variant_id,
      -- Carried forward verbatim. See the header: this is what makes the write
      -- incapable of changing price, staleness, waivers or expiry.
      'productVersion',        t.prior ->> 'productVersion',
      'status',                'approved',
      'approvedPriceCents',    (t.prior ->> 'approvedPriceCents')::bigint,
      'currency',              t.prior ->> 'currency',
      'waivedBlockers',        coalesce(t.prior -> 'waivedBlockers', '[]'::jsonb),
      -- The one changed fact.
      'approvedQuantityLimit', 20,
      'expiresAt',             t.prior -> 'expiresAt',
      'actor',                 v_actor,
      'reason',                v_reason,
      'recordedAt',            to_char(v_recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  from (
    select
      product_id,
      variant_id,
      prior,
      -- Deterministic and unit-scoped, so a second run cannot mint a second id
      -- for the same unit and the NOT EXISTS guard below stays meaningful.
      --
      -- md5 rather than pgcrypto's digest() on purpose: md5() is core
      -- PostgreSQL, so this file needs no extension and cannot fail on the
      -- managed-Supabase layout where pgcrypto lives in `extensions` and
      -- public.digest does not exist at all. This is an identifier derivation,
      -- not a security function, so a fast hash is the right tool.
      'rel_ea_qty20_' || md5(product_id || ':' || variant_id) as release_id
    from ea_qty20_targets
  ) t
  where not exists (
    select 1 from public.research_early_access_releases r where r.release_id = t.release_id
  );

  get diagnostics v_appended = row_count;
  raise notice 'EA-QTY20: appended % release(s) at approvedQuantityLimit = 20 (candidates %)',
    v_appended, v_candidates;

  if v_appended <> v_candidates then
    raise exception
      'EA-QTY20 refused: appended % but expected %; rolling back', v_appended, v_candidates
      using errcode = '55000';
  end if;
end;
$ea_qty20_write$;

commit;

-- Now run EA_QUANTITY_20_RELEASE_AUTHORITY_POSTCHECK.sql.
