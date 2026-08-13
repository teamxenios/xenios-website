-- EA QUANTITY 1-50 RELEASE CANDIDATE WRITE.
--
-- NOT AUTHORIZED BY CHECK-IN. This file has no baked founder claim. It refuses
-- unless a named decision actor, exact decision reason, and hashes from the
-- immediately preceding read-only precheck are supplied as psql variables.
-- It appends release history; it never updates or deletes it.

\if :{?decision_actor}
\else
  \echo 'REFUSED: decision_actor is required'
  \quit 78
\endif
\if :{?decision_reason}
\else
  \echo 'REFUSED: decision_reason is required'
  \quit 78
\endif
\if :{?expected_target_count}
\else
  \echo 'REFUSED: expected_target_count is required'
  \quit 78
\endif
\if :{?expected_target_set_md5}
\else
  \echo 'REFUSED: expected_target_set_md5 is required'
  \quit 78
\endif
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

begin;
set local lock_timeout = '5s';
select set_config('xenios.qty50.actor', :'decision_actor', true);
select set_config('xenios.qty50.reason', :'decision_reason', true);
select set_config('xenios.qty50.expected_target_count', :'expected_target_count', true);
select set_config('xenios.qty50.expected_target_set_md5', :'expected_target_set_md5', true);
select set_config('xenios.qty50.expected_historical_release_md5', :'expected_historical_release_md5', true);
select set_config('xenios.qty50.expected_founder_checkout_md5', :'expected_founder_checkout_md5', true);

lock table public.research_early_access_releases in share row exclusive mode;

do $ea_qty50_write$
declare
  v_actor text := current_setting('xenios.qty50.actor');
  v_reason text := current_setting('xenios.qty50.reason');
  v_expected_count integer := current_setting('xenios.qty50.expected_target_count')::integer;
  v_expected_targets text := current_setting('xenios.qty50.expected_target_set_md5');
  v_expected_history text := current_setting('xenios.qty50.expected_historical_release_md5');
  v_expected_founder text := current_setting('xenios.qty50.expected_founder_checkout_md5');
  v_actual text;
  v_table text;
  v_count integer;
  v_approved integer;
  v_at_20 integer;
  v_at_50 integer;
  v_unexpected integer;
  v_candidates integer;
  v_appended integer;
  v_recorded_at timestamptz;
begin
  if length(btrim(v_actor)) < 3
     or lower(btrim(v_actor)) in ('system', 'automation', 'ai', 'agent', 'unknown') then
    raise exception 'EA-QTY50 refused: decision_actor must be a named human'
      using errcode = '55000';
  end if;
  if length(btrim(v_reason)) < 20 then
    raise exception 'EA-QTY50 refused: decision_reason must state the exact authority'
      using errcode = '55000';
  end if;

  -- M66 and the M61 duplicate guard are hard prerequisites, proved from the
  -- live catalogs rather than inferred from a migration ledger row.
  foreach v_table in array array[
    'research_early_access_cart_items',
    'research_early_access_cart_child_releases'
  ] loop
    select count(*) into v_count
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_table
      and con.contype = 'c'
      and con.convalidated
      and con.conname = v_table || '_quantity_band'
      and regexp_replace(pg_get_expr(con.conbin, con.conrelid), '\s+', '', 'g')
        = '((quantity>=1)AND(quantity<=50))';
    if v_count <> 1 then
      raise exception 'EA-QTY50 refused: exact M66 is absent on public.%', v_table
        using errcode = '55000';
    end if;

    select count(*) into v_count
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_table
      and con.contype = 'c'
      and regexp_replace(pg_get_expr(con.conbin, con.conrelid), '\s+', '', 'g')
        ~ '(quantity(>=|>|<=|<)|([0-9]+)(>=|>|<=|<)quantity)';
    if v_count <> 1 then
      raise exception 'EA-QTY50 refused: public.% has % competing quantity bands',
        v_table, v_count using errcode = '55000';
    end if;
  end loop;

  if not exists (
    select 1 from pg_index
    where indexrelid = to_regclass('public.research_ea_cart_checkout_active_quote_uidx')
      and indisunique and indisvalid and indisready
  ) then
    raise exception 'EA-QTY50 refused: M61 active-quote duplicate guard is absent'
      using errcode = '55000';
  end if;

  select md5(coalesce(string_agg(
    release_id || '|' || product_id || '|' || variant_id || '|' || status || '|' ||
    recorded_at::text || '|' || record::text, E'\n' order by release_id), ''))
  into v_actual
  from public.research_early_access_releases
  where not starts_with(release_id, 'rel_ea_qty50_');
  if v_actual is distinct from v_expected_history then
    raise exception 'EA-QTY50 refused: release history moved since precheck'
      using errcode = '55000';
  end if;

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
  if v_actual is distinct from v_expected_founder then
    raise exception 'EA-QTY50 refused: founder checkout snapshot moved since precheck'
      using errcode = '55000';
  end if;

  -- This packet is exact 20 -> 50 only. First apply requires every current
  -- approved release at 20; replay requires every one at 50. Any other or
  -- mixed state is a new decision surface and fails closed.
  with latest as (
    select distinct on (product_id, variant_id)
      product_id, variant_id, status, record
    from public.research_early_access_releases
    order by product_id, variant_id, recorded_at desc, release_id desc
  )
  select
    count(*) filter (where status = 'approved'),
    count(*) filter (where status = 'approved'
      and (record ->> 'approvedQuantityLimit')::integer = 20),
    count(*) filter (where status = 'approved'
      and (record ->> 'approvedQuantityLimit')::integer = 50),
    count(*) filter (where status = 'approved'
      and coalesce((record ->> 'approvedQuantityLimit')::integer, -1) not in (20, 50))
  into v_approved, v_at_20, v_at_50, v_unexpected
  from latest;
  if v_approved = 0 or v_unexpected <> 0
     or (v_at_20 <> 0 and v_at_50 <> 0)
     or (v_approved <> v_at_20 and v_approved <> v_at_50) then
    raise exception 'EA-QTY50 refused: expected exact all-20 predecessor or exact all-50 replay; approved %, at20 %, at50 %, unexpected %',
      v_approved, v_at_20, v_at_50, v_unexpected using errcode = '55000';
  end if;

  create temporary table ea_qty50_targets on commit drop as
  with latest as (
    select distinct on (product_id, variant_id)
      product_id, variant_id, release_id, status, recorded_at, record
    from public.research_early_access_releases
    order by product_id, variant_id, recorded_at desc, release_id desc
  )
  select product_id, variant_id, release_id as prior_release_id,
         recorded_at as prior_recorded_at, record as prior
  from latest
  where status = 'approved'
    and (record ->> 'approvedQuantityLimit')::integer = 20;

  select count(*), md5(coalesce(string_agg(
    product_id || '|' || variant_id || '|' || prior_release_id,
    E'\n' order by product_id, variant_id), ''))
  into v_candidates, v_actual
  from ea_qty50_targets;
  if v_candidates <> v_expected_count or v_actual is distinct from v_expected_targets then
    raise exception 'EA-QTY50 refused: target set moved since precheck'
      using errcode = '55000';
  end if;

  if v_candidates = 0 then
    raise notice 'EA-QTY50: exact all-50 replay; zero rows appended';
    return;
  end if;

  if exists (
    select 1 from ea_qty50_targets
    where prior ->> 'productVersion' is null
       or prior ->> 'approvedPriceCents' is null
       or prior ->> 'currency' is null
       or prior -> 'waivedBlockers' is null
       or prior ->> 'portal' is distinct from 'private_early_access'
  ) then
    raise exception 'EA-QTY50 refused: a target lacks a required carried-forward field'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from ea_qty50_targets t
    where exists (
      select 1 from public.research_early_access_releases r
      where r.release_id = 'rel_ea_qty50_' || md5(jsonb_build_array(t.product_id, t.variant_id)::text)
    )
  ) then
    raise exception 'EA-QTY50 refused: deterministic release-id collision'
      using errcode = '55000';
  end if;

  v_recorded_at := clock_timestamp();
  if exists (select 1 from ea_qty50_targets where prior_recorded_at >= v_recorded_at) then
    raise exception 'EA-QTY50 refused: a predecessor is future-dated or tied'
      using errcode = '55000';
  end if;

  insert into public.research_early_access_releases
    (release_id, product_id, variant_id, status, recorded_at, record)
  select
    'rel_ea_qty50_' || md5(jsonb_build_array(product_id, variant_id)::text),
    product_id,
    variant_id,
    'approved',
    v_recorded_at,
    jsonb_build_object(
      'releaseId', 'rel_ea_qty50_' || md5(jsonb_build_array(product_id, variant_id)::text),
      'portal', 'private_early_access',
      'productId', product_id,
      'variantId', variant_id,
      'productVersion', prior ->> 'productVersion',
      'status', 'approved',
      'approvedPriceCents', (prior ->> 'approvedPriceCents')::bigint,
      'currency', prior ->> 'currency',
      'waivedBlockers', prior -> 'waivedBlockers',
      'approvedQuantityLimit', 50,
      'expiresAt', prior -> 'expiresAt',
      'actor', btrim(v_actor),
      'reason', btrim(v_reason),
      'recordedAt', to_char(v_recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  from ea_qty50_targets;
  get diagnostics v_appended = row_count;
  if v_appended <> v_candidates then
    raise exception 'EA-QTY50 appended % rows; expected %', v_appended, v_candidates
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.research_early_access_releases cur
    join ea_qty50_targets prev
      on prev.product_id = cur.product_id and prev.variant_id = cur.variant_id
    where cur.release_id = 'rel_ea_qty50_' || md5(jsonb_build_array(prev.product_id, prev.variant_id)::text)
      and (
        cur.record ->> 'productVersion' is distinct from prev.prior ->> 'productVersion'
        or cur.record ->> 'approvedPriceCents' is distinct from prev.prior ->> 'approvedPriceCents'
        or cur.record ->> 'currency' is distinct from prev.prior ->> 'currency'
        or cur.record -> 'waivedBlockers' is distinct from prev.prior -> 'waivedBlockers'
        or cur.record -> 'expiresAt' is distinct from prev.prior -> 'expiresAt'
        or (cur.record ->> 'approvedQuantityLimit')::integer <> 50
      )
  ) then
    raise exception 'EA-QTY50 refused: appended authority changed more than the ceiling'
      using errcode = '55000';
  end if;

  raise notice 'EA-QTY50 appended % release(s); production authority is not accepted until postcheck passes',
    v_appended;
end;
$ea_qty50_write$;

commit;
