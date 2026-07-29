\set ON_ERROR_STOP on

-- Disposable-database verifier for
-- migrations/20260729000000_research_pricing_lineage.sql.
--
-- Run after research-pricing-lineage-disposable-bootstrap.sql on a disposable
-- local PostgreSQL. Unlike the reservation verifier, this verifier applies the
-- candidate itself (via \ir), because the candidate has two guarded branches
-- that must both be proven in one run: first while the Track B order tables do
-- not exist (production shape today), then after this script creates the
-- dormant Track B order tables, and twice in each branch for idempotency.
-- Any failure raises an exception and, with ON_ERROR_STOP, aborts the run;
-- reaching the final PASS line means every check passed.

-- [1] Branch A: production shape. research_order_lines is absent, the pricing
-- authority substrate from the bootstrap is present, and the candidate must be
-- a safe idempotent no-op that creates nothing.
do $$
begin
  if to_regclass('public.research_order_lines') is not null then
    raise exception 'bootstrap shape wrong: research_order_lines already exists';
  end if;
  if to_regclass('public.research_product_prices') is null then
    raise exception 'bootstrap shape wrong: research_product_prices is missing';
  end if;
end;
$$;

\ir ../migrations/20260729000000_research_pricing_lineage.sql
\ir ../migrations/20260729000000_research_pricing_lineage.sql

do $$
begin
  if to_regclass('public.research_order_lines') is not null then
    raise exception 'table-absent branch created research_order_lines';
  end if;
  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'research_order_lines_price_idx'
  ) then
    raise exception 'table-absent branch created the lineage index';
  end if;
end;
$$;
\echo PASS [1] candidate is a safe idempotent no-op while Track B order tables are absent

-- [2] Create the dormant Track B order tables. Verbatim replica of
-- supabase/production/research-track-b-commerce.sql (research_orders,
-- research_order_lines, their indexes, and the script's enable-RLS posture),
-- the same convergence device the reservation verification pair uses for the
-- dormant Track B reservation schema. Then seed one legacy pre-candidate
-- order line to prove the candidate validates and preserves existing rows.
create table if not exists public.research_orders (
  id                      uuid primary key default gen_random_uuid(),
  member_id               uuid not null,
  state                   text not null default 'draft'
                            check (state in ('draft','checkout_pending','payment_authorized',
                                             'manual_review','approved','payment_captured',
                                             'processing','partially_fulfilled','fulfilled',
                                             'delivered','exception','cancelled','refunded','replaced')),
  subtotal_cents          bigint not null check (subtotal_cents >= 0),
  shipping_cents          bigint not null default 0 check (shipping_cents >= 0),
  store_credit_applied_cents bigint not null default 0 check (store_credit_applied_cents >= 0),
  total_cents             bigint not null check (total_cents >= 0),
  authorized_amount_cents bigint check (authorized_amount_cents >= 0),
  captured_amount_cents   bigint check (captured_amount_cents >= 0),
  refunded_cents          bigint not null default 0 check (refunded_cents >= 0),
  payment_reference       text,
  checkout_idempotency_key text,
  last_idempotency_key    text,
  review_triggers         text[] not null default '{}',
  placed_at               timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint research_orders_paid_needs_provider_reference
    check (state not in ('payment_authorized','payment_captured','refunded')
           or payment_reference is not null),
  constraint research_orders_capture_within_authorization
    check (captured_amount_cents is null
           or authorized_amount_cents is null
           or captured_amount_cents <= authorized_amount_cents),
  constraint research_orders_refund_within_capture
    check (captured_amount_cents is null or refunded_cents <= captured_amount_cents),
  constraint research_orders_idempotency_unique unique (member_id, checkout_idempotency_key)
);
create index if not exists research_orders_member_idx on public.research_orders (member_id);
create index if not exists research_orders_state_idx on public.research_orders (state);
create index if not exists research_orders_review_idx
  on public.research_orders (created_at) where state = 'manual_review';

create table if not exists public.research_order_lines (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.research_orders (id) on delete cascade,
  sku              text not null,
  display_name     text not null,
  quantity         integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  fulfillment_owner text not null check (fulfillment_owner in ('mitch','xenios'))
);
create index if not exists research_order_lines_order_idx on public.research_order_lines (order_id);

alter table public.research_orders      enable row level security;
alter table public.research_order_lines enable row level security;

insert into public.research_orders (id, member_id, subtotal_cents, total_cents)
values (
  '40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  7998,
  7998
);
insert into public.research_order_lines (
  id, order_id, sku, display_name, quantity,
  unit_price_cents, line_total_cents, fulfillment_owner
) values (
  '41000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'LEGACY-SKU',
  'Legacy pre-lineage line',
  2,
  3999,
  7998,
  'xenios'
);
\echo PASS [2] dormant Track B order tables created with one legacy pre-candidate line

-- [3] Branch B: apply the candidate twice with the tables present, then prove
-- the exact additive shape and that the legacy row was neither rewritten nor
-- rejected by constraint validation.
\ir ../migrations/20260729000000_research_pricing_lineage.sql
\ir ../migrations/20260729000000_research_pricing_lineage.sql

do $$
declare
  expected_columns constant text[] := array[
    'price_id', 'price_version', 'audience',
    'unit_amount_cents', 'currency', 'priced_at'
  ];
  expected_checks constant text[] := array[
    'research_order_lines_priced_amount_positive',
    'research_order_lines_priced_version_positive',
    'research_order_lines_priced_currency_check',
    'research_order_lines_priced_audience_check',
    'research_order_lines_price_snapshot_coherent'
  ];
  actual integer;
begin
  select count(*) into actual
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'research_order_lines'
     and column_name = any(expected_columns)
     and is_nullable = 'YES';
  if actual <> 6 then
    raise exception 'expected 6 nullable lineage columns, found %', actual;
  end if;
  select count(*) into actual
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'research_order_lines'
     and (column_name, data_type) in (
       ('price_id', 'uuid'),
       ('price_version', 'integer'),
       ('audience', 'text'),
       ('unit_amount_cents', 'bigint'),
       ('currency', 'text'),
       ('priced_at', 'timestamp with time zone')
     );
  if actual <> 6 then
    raise exception 'lineage column data types are wrong (% of 6 match)', actual;
  end if;
  select count(*) into actual
    from pg_constraint
   where conrelid = 'public.research_order_lines'::regclass
     and contype = 'c'
     and conname = any(expected_checks);
  if actual <> 5 then
    raise exception 'expected 5 lineage CHECK constraints, found %', actual;
  end if;
  if not exists (
    select 1
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'research_order_lines'
       and indexname = 'research_order_lines_price_idx'
       and indexdef like '%WHERE (price_id IS NOT NULL)%'
  ) then
    raise exception 'partial reconciliation index is missing or not partial';
  end if;
  if not exists (
    select 1
      from public.research_order_lines
     where id = '41000000-0000-4000-8000-000000000001'
       and sku = 'LEGACY-SKU'
       and quantity = 2
       and unit_price_cents = 3999
       and line_total_cents = 7998
       and price_id is null
       and price_version is null
       and audience is null
       and unit_amount_cents is null
       and currency is null
       and priced_at is null
  ) then
    raise exception 'legacy line was rewritten or backfilled by the candidate';
  end if;
  if (select count(*) from public.research_order_lines) <> 1 then
    raise exception 'candidate changed the order-line row count';
  end if;
end;
$$;
\echo PASS [3] candidate applied twice over the Track B shape: exact columns, CHECKs, partial index, zero data rewrites

-- [4] Pricing authority fixtures plus the one-active-price partial unique
-- index on research_product_prices: a second active row for the same
-- variant+audience must be rejected while superseded history and other
-- audiences remain insertable.
insert into public.research_products (id, sku, display_name, canonical_name)
values (
  '30000000-0000-4000-8000-000000000001',
  'PRICING-PROD-A',
  'Pricing Product A',
  'Pricing Product A'
);
insert into public.research_product_variants (
  id, product_id, sku, label, created_by, updated_by
) values (
  '31000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'PRICING-SKU-A',
  '10mg vial',
  'verifier',
  'verifier'
);
insert into public.research_product_prices (
  id, product_id, variant_id, audience, amount_cents, currency,
  effective_at, status, version, created_by
) values (
  '32000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'retail',
  12000,
  'USD',
  '2026-07-28T00:00:00.000Z',
  'active',
  1,
  'verifier'
);

do $$
declare
  denied boolean := false;
begin
  begin
    insert into public.research_product_prices (
      product_id, variant_id, audience, amount_cents, currency,
      effective_at, status, version, created_by
    ) values (
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      'retail',
      13000,
      'USD',
      '2026-07-28T01:00:00.000Z',
      'active',
      2,
      'verifier'
    );
  exception when unique_violation then
    denied := sqlerrm like '%research_product_prices_one_active_idx%';
  end;
  if not denied then
    raise exception 'duplicate active price for the same variant+audience was accepted';
  end if;
end;
$$;

insert into public.research_product_prices (
  id, product_id, variant_id, audience, amount_cents, currency,
  effective_at, status, version, created_by
) values (
  '32000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'retail',
  13000,
  'USD',
  '2026-07-28T01:00:00.000Z',
  'superseded',
  2,
  'verifier'
);
insert into public.research_product_prices (
  id, product_id, variant_id, audience, amount_cents, currency,
  effective_at, status, version, created_by
) values (
  '32000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'member',
  9000,
  'USD',
  '2026-07-28T00:00:00.000Z',
  'active',
  1,
  'verifier'
);

do $$
begin
  if (select count(*) from public.research_product_prices) <> 3 then
    raise exception 'price fixture count drifted';
  end if;
end;
$$;
\echo PASS [4] one active price per variant+audience is enforced; history and other audiences insert cleanly

-- [5] RLS is forced on research_product_prices with zero policies, browser
-- roles hold no privilege and are denied on direct DML, and service_role is
-- SELECT-only (its direct writes are denied; writes go through the reviewed
-- SECURITY DEFINER commands).
do $$
declare
  browser_role text;
  denied boolean;
begin
  if not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'research_product_prices'
       and c.relrowsecurity
       and c.relforcerowsecurity
  ) then
    raise exception 'RLS is not forced on research_product_prices';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'research_product_prices'
  ) then
    raise exception 'unexpected RLS policy exists on research_product_prices';
  end if;

  foreach browser_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(browser_role, 'public.research_product_prices', 'select')
       or has_table_privilege(browser_role, 'public.research_product_prices', 'insert')
       or has_table_privilege(browser_role, 'public.research_product_prices', 'update')
       or has_table_privilege(browser_role, 'public.research_product_prices', 'delete') then
      raise exception 'browser grant remains on research_product_prices for %', browser_role;
    end if;
    denied := false;
    begin
      execute 'set local role ' || browser_role;
      insert into public.research_product_prices (
        product_id, variant_id, audience, amount_cents, currency,
        effective_at, status, version, created_by
      ) values (
        '30000000-0000-4000-8000-000000000001',
        '31000000-0000-4000-8000-000000000001',
        'wholesale',
        100,
        'USD',
        '2026-07-28T02:00:00.000Z',
        'draft',
        1,
        browser_role
      );
    exception when insufficient_privilege then
      denied := true;
    end;
    execute 'reset role';
    if not denied then
      raise exception 'direct price insert as % was not denied', browser_role;
    end if;
    denied := false;
    begin
      execute 'set local role ' || browser_role;
      update public.research_product_prices set status = 'expired'
       where id = '32000000-0000-4000-8000-000000000002';
    exception when insufficient_privilege then
      denied := true;
    end;
    execute 'reset role';
    if not denied then
      raise exception 'direct price update as % was not denied', browser_role;
    end if;
  end loop;

  if not has_table_privilege('service_role', 'public.research_product_prices', 'select') then
    raise exception 'service_role lost its price SELECT grant';
  end if;
  if has_table_privilege('service_role', 'public.research_product_prices', 'insert')
     or has_table_privilege('service_role', 'public.research_product_prices', 'update')
     or has_table_privilege('service_role', 'public.research_product_prices', 'delete') then
    raise exception 'service_role retains direct price DML';
  end if;
  denied := false;
  begin
    execute 'set local role service_role';
    insert into public.research_product_prices (
      product_id, variant_id, audience, amount_cents, currency,
      effective_at, status, version, created_by
    ) values (
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      'professional',
      100,
      'USD',
      '2026-07-28T02:00:00.000Z',
      'draft',
      1,
      'service_role'
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  execute 'reset role';
  if not denied then
    raise exception 'direct price insert as service_role was not denied';
  end if;
end;
$$;
\echo PASS [5] forced RLS, zero policies, browser roles denied, service_role SELECT-only on research_product_prices

-- [6] The immutable-history trigger blocks UPDATE of economic fields and any
-- DELETE, while a lifecycle status transition remains possible.
do $$
declare
  denied boolean;
begin
  denied := false;
  begin
    update public.research_product_prices
       set amount_cents = 999
     where id = '32000000-0000-4000-8000-000000000001';
  exception when others then
    denied := sqlerrm like '%economic history is immutable%';
  end;
  if not denied then
    raise exception 'economic price field UPDATE was not blocked';
  end if;

  denied := false;
  begin
    update public.research_product_prices
       set audience = 'wholesale'
     where id = '32000000-0000-4000-8000-000000000001';
  exception when others then
    denied := sqlerrm like '%economic history is immutable%';
  end;
  if not denied then
    raise exception 'price audience UPDATE was not blocked';
  end if;

  denied := false;
  begin
    delete from public.research_product_prices
     where id = '32000000-0000-4000-8000-000000000002';
  exception when others then
    denied := sqlerrm like '%history is append-only%';
  end;
  if not denied then
    raise exception 'price DELETE was not blocked';
  end if;

  update public.research_product_prices
     set status = 'expired', updated_at = '2026-07-28T03:00:00.000Z'
   where id = '32000000-0000-4000-8000-000000000002';
  if not exists (
    select 1 from public.research_product_prices
     where id = '32000000-0000-4000-8000-000000000002'
       and status = 'expired'
       and amount_cents = 13000
  ) then
    raise exception 'non-economic lifecycle transition failed';
  end if;
end;
$$;
\echo PASS [6] price history is immutable: economic UPDATE and DELETE blocked, lifecycle transition allowed

-- [7] Order-line snapshot mechanics: a full coherent snapshot and a legacy
-- all-null line insert cleanly; zero/negative amounts, foreign currency,
-- out-of-band audiences, compare_at, non-positive versions, and every partial
-- snapshot are rejected by the intended named constraint with no row leak.
insert into public.research_order_lines (
  id, order_id, sku, display_name, quantity,
  unit_price_cents, line_total_cents, fulfillment_owner,
  price_id, price_version, audience, unit_amount_cents, currency, priced_at
) values (
  '41000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',
  'PRICING-SKU-A',
  'Pricing Product A 10mg vial',
  1,
  12000,
  12000,
  'xenios',
  '32000000-0000-4000-8000-000000000001',
  1,
  'retail',
  12000,
  'USD',
  '2026-07-28T00:30:00.000Z'
);

do $$
declare
  probe record;
  denied boolean;
begin
  for probe in
    select *
      from (values
        ('zero amount',
         '32000000-0000-4000-8000-000000000001'::uuid, 1, 'retail',
         0::bigint, 'USD', '2026-07-28T00:30:00.000Z'::timestamptz,
         'research_order_lines_priced_amount_positive'),
        ('negative amount',
         '32000000-0000-4000-8000-000000000001'::uuid, 1, 'retail',
         -12000::bigint, 'USD', '2026-07-28T00:30:00.000Z'::timestamptz,
         'research_order_lines_priced_amount_positive'),
        ('foreign currency',
         '32000000-0000-4000-8000-000000000001'::uuid, 1, 'retail',
         12000::bigint, 'EUR', '2026-07-28T00:30:00.000Z'::timestamptz,
         'research_order_lines_priced_currency_check'),
        ('compare_at audience',
         '32000000-0000-4000-8000-000000000001'::uuid, 1, 'compare_at',
         12000::bigint, 'USD', '2026-07-28T00:30:00.000Z'::timestamptz,
         'research_order_lines_priced_audience_check'),
        ('unknown audience',
         '32000000-0000-4000-8000-000000000001'::uuid, 1, 'vip',
         12000::bigint, 'USD', '2026-07-28T00:30:00.000Z'::timestamptz,
         'research_order_lines_priced_audience_check'),
        ('zero version',
         '32000000-0000-4000-8000-000000000001'::uuid, 0, 'retail',
         12000::bigint, 'USD', '2026-07-28T00:30:00.000Z'::timestamptz,
         'research_order_lines_priced_version_positive'),
        ('price id only',
         '32000000-0000-4000-8000-000000000001'::uuid, null, null,
         null::bigint, null, null::timestamptz,
         'research_order_lines_price_snapshot_coherent'),
        ('missing priced_at',
         '32000000-0000-4000-8000-000000000001'::uuid, 1, 'retail',
         12000::bigint, 'USD', null::timestamptz,
         'research_order_lines_price_snapshot_coherent'),
        ('missing currency',
         '32000000-0000-4000-8000-000000000001'::uuid, 1, 'retail',
         12000::bigint, null, '2026-07-28T00:30:00.000Z'::timestamptz,
         'research_order_lines_price_snapshot_coherent'),
        ('missing price identity',
         null::uuid, 1, 'retail',
         12000::bigint, 'USD', '2026-07-28T00:30:00.000Z'::timestamptz,
         'research_order_lines_price_snapshot_coherent')
      ) as rejection(
        label, price_id, price_version, audience,
        unit_amount_cents, currency, priced_at, expected_constraint
      )
  loop
    denied := false;
    begin
      insert into public.research_order_lines (
        order_id, sku, display_name, quantity,
        unit_price_cents, line_total_cents, fulfillment_owner,
        price_id, price_version, audience,
        unit_amount_cents, currency, priced_at
      ) values (
        '40000000-0000-4000-8000-000000000001',
        'PRICING-SKU-A',
        'Rejection probe',
        1,
        12000,
        12000,
        'xenios',
        probe.price_id,
        probe.price_version,
        probe.audience,
        probe.unit_amount_cents,
        probe.currency,
        probe.priced_at
      );
    exception when check_violation then
      denied := sqlerrm like '%' || probe.expected_constraint || '%';
    end;
    if not denied then
      raise exception '% snapshot was not rejected by %',
        probe.label, probe.expected_constraint;
    end if;
  end loop;

  if (select count(*) from public.research_order_lines) <> 2 then
    raise exception 'rejected snapshot probes leaked rows';
  end if;
  if not exists (
    select 1
      from public.research_order_lines line
      join public.research_product_prices price on price.id = line.price_id
     where line.id = '41000000-0000-4000-8000-000000000002'
       and price.amount_cents = line.unit_amount_cents
       and price.audience = line.audience
       and price.version = line.price_version
       and price.currency = line.currency
  ) then
    raise exception 'coherent snapshot does not reconcile against its authority price row';
  end if;
end;
$$;
\echo PASS [7] snapshot coherence: honest full snapshots and legacy lines insert; every partial or dishonest snapshot is rejected

-- [8] The candidate stays idempotent over populated tables, then the
-- disposable fixtures return to zero, proving the candidate itself seeded
-- nothing durable.
create temporary table pricing_lineage_final_counts as
select
  (select count(*) from public.research_order_lines) as order_lines,
  (select count(*) from public.research_orders) as orders,
  (select count(*) from public.research_product_prices) as prices;

\ir ../migrations/20260729000000_research_pricing_lineage.sql

do $$
begin
  if exists (
    select 1
      from pricing_lineage_final_counts before
     where before.order_lines <> (select count(*) from public.research_order_lines)
        or before.orders <> (select count(*) from public.research_orders)
        or before.prices <> (select count(*) from public.research_product_prices)
  ) then
    raise exception 're-running the candidate over populated tables changed row counts';
  end if;
  if (
    select count(*)
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'research_order_lines'
       and column_name in (
         'price_id', 'price_version', 'audience',
         'unit_amount_cents', 'currency', 'priced_at'
       )
  ) <> 6 then
    raise exception 're-run altered the lineage column set';
  end if;
end;
$$;

truncate table
  public.research_order_lines,
  public.research_orders,
  public.research_product_prices,
  public.research_product_variants,
  public.research_product_content,
  public.research_products
restart identity cascade;

do $$
begin
  if (select count(*) from public.research_order_lines) <> 0
     or (select count(*) from public.research_orders) <> 0
     or (select count(*) from public.research_product_prices) <> 0
     or (select count(*) from public.research_product_variants) <> 0
     or (select count(*) from public.research_products) <> 0 then
    raise exception 'disposable verifier did not return pricing state to zero';
  end if;
end;
$$;
\echo PASS [8] candidate is idempotent over populated tables and seeded nothing durable
\echo PASS research-pricing-lineage: all sections passed
