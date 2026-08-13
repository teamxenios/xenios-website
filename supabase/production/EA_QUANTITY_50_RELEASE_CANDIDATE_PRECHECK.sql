-- EA QUANTITY 1-50 RELEASE CANDIDATE PRECHECK. READ ONLY.
--
-- This file does not authorize quantity 50 and writes nothing. It must run
-- after M66 and immediately before any separately approved authority write.

begin transaction read only;

\echo '=== Runtime identity ==='
select version() as postgres_version, current_database() as database_name, now() as observed_at;

\echo '=== Exact M66 bands and money identity ==='
with constraints as (
  select rel.relname,
         con.conname,
         con.convalidated,
         regexp_replace(pg_get_expr(con.conbin, con.conrelid), '\s+', '', 'g') as expression
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname in (
      'research_early_access_cart_items',
      'research_early_access_cart_child_releases'
    )
    and con.contype = 'c'
)
select * from constraints order by relname, conname;

do $precheck$
declare
  v_table text;
  v_count integer;
begin
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
      raise exception 'EA-QTY50 precheck requires exact M66 on public.%', v_table
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
      raise exception 'EA-QTY50 precheck found % quantity range constraints on public.%',
        v_count, v_table using errcode = '55000';
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'research_early_access_cart_items'
      and con.contype = 'c'
      and regexp_replace(pg_get_expr(con.conbin, con.conrelid), '\s+', '', 'g')
        = '(subtotal_cents=(unit_price_cents*quantity))'
  ) then
    raise exception 'EA-QTY50 precheck: money identity is absent' using errcode = '55000';
  end if;

  if not exists (
    select 1 from pg_index
    where indexrelid = to_regclass('public.research_ea_cart_checkout_active_quote_uidx')
      and indisunique and indisvalid and indisready
  ) then
    raise exception 'EA-QTY50 precheck: M61 active-quote duplicate guard is absent or invalid'
      using errcode = '55000';
  end if;

  select count(*) into v_count from (
    select quote_id
    from public.research_early_access_cart_checkouts
    where disposition is null
    group by quote_id
    having count(*) > 1
  ) duplicates;
  if v_count <> 0 then
    raise exception 'EA-QTY50 precheck: % active duplicate quote(s) exist', v_count
      using errcode = '55000';
  end if;
end;
$precheck$;

-- Exact predecessor state: every currently approved unit is either still at
-- the accepted release-20 authority (first apply), or every one is already at
-- 50 (idempotent replay). A mixed state or any other number is unexpected and
-- must be resolved by a new reviewed packet, never guessed through this one.
do $release_state$
declare
  v_approved integer;
  v_at_20 integer;
  v_at_50 integer;
  v_unexpected integer;
begin
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

  if v_approved = 0 then
    raise exception 'EA-QTY50 precheck: no current approved releases' using errcode = '55000';
  end if;
  if v_unexpected <> 0 then
    raise exception 'EA-QTY50 precheck: % approved release(s) are neither exact 20 nor exact 50',
      v_unexpected using errcode = '55000';
  end if;
  if v_at_20 <> 0 and v_at_50 <> 0 then
    raise exception 'EA-QTY50 precheck: mixed predecessor state (% at 20, % at 50)',
      v_at_20, v_at_50 using errcode = '55000';
  end if;
  if v_approved <> v_at_20 and v_approved <> v_at_50 then
    raise exception 'EA-QTY50 precheck: approved release state is incomplete or malformed'
      using errcode = '55000';
  end if;
  raise notice 'EA-QTY50 exact release state: % approved, % at 20, % at 50',
    v_approved, v_at_20, v_at_50;
end;
$release_state$;

\echo '=== Current release authority and exact proposed write set ==='
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
  (record ->> 'approvedQuantityLimit')::integer as current_limit,
  50 as proposed_limit,
  recorded_at
from latest
where status = 'approved'
order by product_id, variant_id;

\echo '=== Evidence hashes to bind into WRITE and POSTCHECK ==='
with latest as (
  select distinct on (product_id, variant_id)
    product_id, variant_id, release_id, status, recorded_at, record
  from public.research_early_access_releases
  order by product_id, variant_id, recorded_at desc, release_id desc
),
targets as (
  select * from latest
  where status = 'approved'
    and (record ->> 'approvedQuantityLimit')::integer = 20
),
historical as (
  select * from public.research_early_access_releases
  where not starts_with(release_id, 'rel_ea_qty50_')
),
founder_checkout as (
  select jsonb_build_object(
    'checkout', (select to_jsonb(c) from public.research_early_access_cart_checkouts c
                 where c.checkout_number = 'XEC-E1703CC63BBE89E6839E24C1'),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.line_index)
                       from public.research_early_access_cart_items i
                       join public.research_early_access_cart_checkouts c on c.id = i.cart_checkout_id
                       where c.checkout_number = 'XEC-E1703CC63BBE89E6839E24C1'), '[]'::jsonb),
    'invoice', (select to_jsonb(v) from public.research_early_access_cart_invoices v
                join public.research_early_access_cart_checkouts c on c.id = v.cart_checkout_id
                where c.checkout_number = 'XEC-E1703CC63BBE89E6839E24C1')
  ) as snapshot
)
select
  (select count(*) from targets) as target_count,
  (select md5(coalesce(string_agg(product_id || '|' || variant_id || '|' || release_id,
                                  E'\n' order by product_id, variant_id), '')) from targets)
    as target_set_md5,
  (select md5(coalesce(string_agg(release_id || '|' || product_id || '|' || variant_id || '|' ||
                                  status || '|' || recorded_at::text || '|' || record::text,
                                  E'\n' order by release_id), '')) from historical)
    as historical_release_md5,
  (select md5(snapshot::text) from founder_checkout) as founder_checkout_md5,
  (select count(*) from public.research_early_access_releases
   where starts_with(release_id, 'rel_ea_qty50_')) as existing_qty50_rows;

rollback;
