-- EA QUANTITY 1-50 RELEASE CANDIDATE POSTCHECK. READ ONLY.
-- Requires the two immutable hashes emitted by the precheck.

\if :{?expected_historical_release_md5}
\else
  \echo 'REFUSED: expected_historical_release_md5 is required'
  \quit 78
\endif
\if :{?expected_founder_checkout_md5}
\else
  \echo 'REFUSED: expected_founder_checkout_md5 is required'
  \quit 78
\endif

begin transaction read only;
select set_config('xenios.qty50.expected_historical_release_md5', :'expected_historical_release_md5', true);
select set_config('xenios.qty50.expected_founder_checkout_md5', :'expected_founder_checkout_md5', true);

do $ea_qty50_postcheck$
declare
  v_actual text;
  v_bad integer;
  v_approved integer;
  v_at_least_50 integer;
begin
  with latest as (
    select distinct on (product_id, variant_id)
      product_id, variant_id, release_id, status, recorded_at, record
    from public.research_early_access_releases
    order by product_id, variant_id, recorded_at desc, release_id desc
  )
  select
    count(*) filter (where status = 'approved'),
    count(*) filter (where status = 'approved'
      and (record ->> 'approvedQuantityLimit')::integer >= 50)
  into v_approved, v_at_least_50
  from latest;
  if v_approved = 0 or v_approved <> v_at_least_50 then
    raise exception 'FAIL % of % approved units remain below 50',
      v_approved - v_at_least_50, v_approved;
  end if;
  raise notice 'PASS all % current approved units are at least 50', v_approved;

  select count(*) into v_bad
  from public.research_early_access_releases cur
  where starts_with(cur.release_id, 'rel_ea_qty50_')
    and not exists (
      select 1 from public.research_early_access_releases prev
      where prev.product_id = cur.product_id
        and prev.variant_id = cur.variant_id
        and prev.release_id <> cur.release_id
        and (prev.recorded_at, prev.release_id) < (cur.recorded_at, cur.release_id)
    );
  if v_bad <> 0 then
    raise exception 'FAIL % quantity-50 release(s) have no predecessor', v_bad;
  end if;

  with ranked as (
    select product_id, variant_id, release_id, status, record, recorded_at,
           row_number() over (
             partition by product_id, variant_id
             order by recorded_at desc, release_id desc
           ) as rn
    from public.research_early_access_releases
  ), pairs as (
    select cur.*, prev.status as prior_status, prev.record as prior
    from ranked cur
    join ranked prev
      on prev.product_id = cur.product_id
     and prev.variant_id = cur.variant_id
     and prev.rn = cur.rn + 1
    where starts_with(cur.release_id, 'rel_ea_qty50_')
  )
  select count(*) into v_bad
  from pairs
  where prior_status <> 'approved'
     or record ->> 'productVersion' is distinct from prior ->> 'productVersion'
     or record ->> 'approvedPriceCents' is distinct from prior ->> 'approvedPriceCents'
     or record ->> 'currency' is distinct from prior ->> 'currency'
     or record -> 'waivedBlockers' is distinct from prior -> 'waivedBlockers'
     or record -> 'expiresAt' is distinct from prior -> 'expiresAt'
     or (record ->> 'approvedQuantityLimit')::integer <> 50
     or (record ->> 'approvedQuantityLimit')::integer
        < (prior ->> 'approvedQuantityLimit')::integer;
  if v_bad <> 0 then
    raise exception 'FAIL % quantity-50 release(s) changed an unauthorized field, resurrected, or narrowed',
      v_bad;
  end if;
  raise notice 'PASS every quantity-50 release is a widening-only approved successor';

  select md5(coalesce(string_agg(
    release_id || '|' || product_id || '|' || variant_id || '|' || status || '|' ||
    recorded_at::text || '|' || record::text, E'\n' order by release_id), ''))
  into v_actual
  from public.research_early_access_releases
  where not starts_with(release_id, 'rel_ea_qty50_');
  if v_actual is distinct from current_setting('xenios.qty50.expected_historical_release_md5') then
    raise exception 'FAIL historical release rows changed';
  end if;
  raise notice 'PASS historical release rows are byte-identical to precheck';

  select md5(jsonb_build_object(
    'checkout', (select to_jsonb(c) from public.research_early_access_cart_checkouts c
                 where c.checkout_number = 'XEC-E1703CC63BBE89E6839E24C1'),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.line_index)
                       from public.research_early_access_cart_items i
                       join public.research_early_access_cart_checkouts c on c.id = i.cart_checkout_id
                       where c.checkout_number = 'XEC-E1703CC63BBE89E6839E24C1'), '[]'::jsonb),
    'invoice', (select to_jsonb(v) from public.research_early_access_cart_invoices v
                join public.research_early_access_cart_checkouts c on c.id = v.cart_checkout_id
                where c.checkout_number = 'XEC-E1703CC63BBE89E6839E24C1')
  )::text) into v_actual;
  if v_actual is distinct from current_setting('xenios.qty50.expected_founder_checkout_md5') then
    raise exception 'FAIL founder checkout subtree changed';
  end if;
  raise notice 'PASS founder checkout subtree is byte-identical to precheck';
end;
$ea_qty50_postcheck$;

\echo '=== Final current authority ==='
with latest as (
  select distinct on (product_id, variant_id)
    product_id, variant_id, release_id, status, recorded_at, record
  from public.research_early_access_releases
  order by product_id, variant_id, recorded_at desc, release_id desc
)
select product_id, variant_id, release_id, status,
       (record ->> 'approvedQuantityLimit')::integer as approved_quantity_limit,
       (record ->> 'approvedPriceCents')::bigint as approved_price_cents,
       record ->> 'actor' as actor,
       record ->> 'reason' as reason,
       recorded_at
from latest order by product_id, variant_id;

rollback;
