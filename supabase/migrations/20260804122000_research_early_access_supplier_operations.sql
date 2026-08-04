-- Early Access supplier operations persistence.
--
-- Three durable facts this file owns:
--
-- 1. SUPPLIER CONFIRMATIONS (the SUPPLIER_CONFIRMED_ON_DEMAND record): a
--    supplier's confirmed, expiring commitment to fulfill an exact unit, with
--    the organization, contact, SKU mapping, strength, presentation, quantity
--    ceiling, fulfillment location and method, the 72-hour handoff target,
--    shipping and cold-chain requirements, documentation state, evidence, and
--    the named human who confirmed it. The supplier directory the order flow
--    consults answers from ACTIVE, UNEXPIRED rows here and from nothing else,
--    so an unconfirmed unit stays unsellable exactly as it is today.
--
-- 2. MANUAL ACTIONS: the durable ledger for `recordManualAction` records
--    (supplier communications, payment verifications done off-band, supplier
--    order transmissions, tracking entries, affiliate payouts, and refund
--    transmissions). Their ids are deterministic (mact_<sha256[0:32]>), which
--    makes the primary key a natural idempotency key.
--
-- 3. SHIPPING REGIONS: the explicit allowlist behind the shipping policy.
--    An empty table serves nowhere; the policy fails closed by shape.
--
-- ACCESS SHAPE. Same as the identity and commerce migrations: RLS enabled and
-- forced, zero policies, zero table grants for any role, SECURITY DEFINER
-- functions granted to service_role alone. Additive; safe to apply twice.

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------

do $preflight$
declare
  v_tables int;
begin
  select count(*) into v_tables
  from pg_catalog.pg_tables
  where schemaname = 'public'
    and tablename in (
      'research_early_access_supplier_confirmations',
      'research_early_access_manual_actions',
      'research_early_access_shipping_regions'
    );
  if v_tables not in (0, 3) then
    raise exception
      'research_early_access supplier operations is partially installed: % of 3 tables exist. Resolve manually before re-applying.',
      v_tables;
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.research_early_access_supplier_confirmations (
  confirmation_id text primary key
    constraint research_early_access_supplier_conf_id_shape
    check (confirmation_id ~ '^[A-Za-z0-9_.-]{4,128}$'),
  supplier_org text not null
    constraint research_early_access_supplier_conf_org_shape
    check (length(supplier_org) between 2 and 200),
  contact jsonb not null,
  product_id text not null,
  variant_id text not null,
  sku text not null,
  supplier_sku text not null
    constraint research_early_access_supplier_conf_sku_shape
    check (length(supplier_sku) between 1 and 128),
  strength text not null
    constraint research_early_access_supplier_conf_strength_shape
    check (length(strength) between 1 and 128),
  presentation text not null
    constraint research_early_access_supplier_conf_presentation_shape
    check (length(presentation) between 1 and 128),
  max_quantity integer not null
    constraint research_early_access_supplier_conf_quantity_positive
    check (max_quantity > 0),
  fulfillment_location text not null
    constraint research_early_access_supplier_conf_location_shape
    check (length(fulfillment_location) between 2 and 200),
  fulfillment_method text not null
    constraint research_early_access_supplier_conf_method_shape
    check (length(fulfillment_method) between 2 and 128),
  target_handoff_hours integer not null default 72
    constraint research_early_access_supplier_conf_handoff_range
    check (target_handoff_hours between 1 and 720),
  shipping_requirements text not null
    constraint research_early_access_supplier_conf_shipping_shape
    check (length(shipping_requirements) between 1 and 2000),
  cold_chain_state text not null
    constraint research_early_access_supplier_conf_cold_chain_shape
    check (length(cold_chain_state) between 1 and 64),
  documentation_state text not null
    constraint research_early_access_supplier_conf_documentation_shape
    check (length(documentation_state) between 1 and 200),
  confirmed_at timestamptz not null,
  expires_at timestamptz
    constraint research_early_access_supplier_conf_expiry_order
    check (expires_at is null or expires_at > confirmed_at),
  confirmed_by text not null
    constraint research_early_access_supplier_conf_named_human
    check (
      length(trim(confirmed_by)) between 2 and 200
      and lower(trim(confirmed_by)) not in
        ('system', 'the system', 'automation', 'robot', 'bot', 'service', 'admin')
    ),
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    constraint research_early_access_supplier_conf_status_vocabulary
    check (status in ('active', 'withdrawn')),
  withdrawn_at timestamptz,
  withdrawn_by text,
  record jsonb not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_early_access_supplier_conf_withdrawal_pair
    check ((withdrawn_at is null) = (withdrawn_by is null))
);

comment on table public.research_early_access_supplier_confirmations is
  'SUPPLIER_CONFIRMED_ON_DEMAND records: a supplier''s expiring commitment to fulfill an exact unit. The supplier directory answers only from active, unexpired rows.';

create index if not exists research_early_access_supplier_conf_unit_idx
  on public.research_early_access_supplier_confirmations
  (product_id, variant_id, confirmed_at desc)
  where status = 'active';

-- Manual actions: append-only, deterministic ids.
create table if not exists public.research_early_access_manual_actions (
  action_id text primary key
    constraint research_early_access_manual_actions_id_shape
    check (action_id ~ '^mact_[a-f0-9]{32}$'),
  kind text not null
    constraint research_early_access_manual_actions_kind_shape
    check (length(kind) between 1 and 64),
  subject_id text not null,
  actor text not null
    constraint research_early_access_manual_actions_actor_shape
    check (length(actor) between 2 and 200),
  at timestamptz not null,
  channel text not null,
  external_reference text,
  prior_status text not null,
  new_status text not null,
  record jsonb not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp()
);

comment on table public.research_early_access_manual_actions is
  'Durable ledger of manual operator actions (supplier communication, refund transmission, affiliate payout, and the rest of the manual-action vocabulary). Append-only.';

create index if not exists research_early_access_manual_actions_subject_idx
  on public.research_early_access_manual_actions (subject_id, at);

-- The shipping allowlist. region null means the whole country is served.
create table if not exists public.research_early_access_shipping_regions (
  id bigint generated always as identity primary key,
  country text not null
    constraint research_early_access_shipping_country_shape
    check (country ~ '^[A-Z]{2}$'),
  region text
    constraint research_early_access_shipping_region_shape
    check (region is null or length(region) between 1 and 64),
  active boolean not null default true,
  added_by text not null
    constraint research_early_access_shipping_added_by_shape
    check (length(added_by) between 2 and 200),
  added_at timestamptz not null default pg_catalog.clock_timestamp()
);

comment on table public.research_early_access_shipping_regions is
  'Explicit shipping allowlist for Early Access. Empty means nowhere is served: the policy fails closed by shape.';

create unique index if not exists research_early_access_shipping_regions_unique
  on public.research_early_access_shipping_regions (country, coalesce(region, '*'));

-- ---------------------------------------------------------------------------
-- Append-only enforcement for manual actions
-- ---------------------------------------------------------------------------

create or replace function public.research_early_access_supplier_block_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $block$
begin
  raise exception 'research_early_access %.% is append-only', tg_table_schema, tg_table_name;
end;
$block$;

do $append_only$
begin
  execute 'drop trigger if exists research_early_access_manual_actions_append_only on public.research_early_access_manual_actions';
  execute 'create trigger research_early_access_manual_actions_append_only
             before update or delete on public.research_early_access_manual_actions
             for each row execute function public.research_early_access_supplier_block_mutation()';
end
$append_only$;

-- ---------------------------------------------------------------------------
-- Row level security and privileges
-- ---------------------------------------------------------------------------

do $rls_and_revokes$
declare
  v_role text;
  v_table text;
begin
  foreach v_table in array array[
    'research_early_access_supplier_confirmations',
    'research_early_access_manual_actions',
    'research_early_access_shipping_regions'
  ] loop
    execute pg_catalog.format('alter table public.%I enable row level security', v_table);
    execute pg_catalog.format('alter table public.%I force row level security', v_table);
    execute pg_catalog.format('revoke all on table public.%I from public', v_table);
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
        execute pg_catalog.format('revoke all on table public.%I from %I', v_table, v_role);
      end if;
    end loop;
  end loop;
end
$rls_and_revokes$;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Record one supplier confirmation. 'recorded' or 'duplicate'. The audit
-- event lands in the same transaction, so a confirmation cannot exist that
-- the audit trail does not know about.
create or replace function public.research_early_access_record_supplier_confirmation(
  p_record jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_supplier_confirmation$
begin
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'research_early_access_record_supplier_confirmation: record must be a jsonb object';
  end if;
  insert into public.research_early_access_supplier_confirmations
    (confirmation_id, supplier_org, contact, product_id, variant_id, sku,
     supplier_sku, strength, presentation, max_quantity, fulfillment_location,
     fulfillment_method, target_handoff_hours, shipping_requirements,
     cold_chain_state, documentation_state, confirmed_at, expires_at,
     confirmed_by, evidence, record)
  values (
    p_record ->> 'confirmationId',
    p_record ->> 'supplierOrg',
    coalesce(p_record -> 'contact', '{}'::jsonb),
    p_record ->> 'productId',
    p_record ->> 'variantId',
    p_record ->> 'sku',
    p_record ->> 'supplierSku',
    p_record ->> 'strength',
    p_record ->> 'presentation',
    (p_record ->> 'maxQuantity')::integer,
    p_record ->> 'fulfillmentLocation',
    p_record ->> 'fulfillmentMethod',
    coalesce((p_record ->> 'targetHandoffHours')::integer, 72),
    p_record ->> 'shippingRequirements',
    p_record ->> 'coldChainState',
    p_record ->> 'documentationState',
    (p_record ->> 'confirmedAt')::timestamptz,
    (p_record ->> 'expiresAt')::timestamptz,
    p_record ->> 'confirmedBy',
    coalesce(p_record -> 'evidence', '{}'::jsonb),
    p_record
  );

  insert into public.research_early_access_audit_events (event, order_number, actor, at, detail)
  values (
    'early_access.supplier.confirmed_on_demand',
    '-',
    p_record ->> 'confirmedBy',
    (p_record ->> 'confirmedAt')::timestamptz,
    jsonb_build_object(
      'confirmationId', p_record ->> 'confirmationId',
      'supplierOrg', p_record ->> 'supplierOrg',
      'productId', p_record ->> 'productId',
      'variantId', p_record ->> 'variantId',
      'expiresAt', p_record ->> 'expiresAt'
    )
  );

  return 'recorded';
exception
  when unique_violation then
    return 'duplicate';
end;
$record_supplier_confirmation$;

-- Withdraw one confirmation. True when this call withdrew it.
create or replace function public.research_early_access_withdraw_supplier_confirmation(
  p_confirmation_id text,
  p_withdrawn_by text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $withdraw_supplier_confirmation$
declare
  v_updated integer;
begin
  if p_withdrawn_by is null or length(trim(p_withdrawn_by)) < 2 then
    return false;
  end if;
  update public.research_early_access_supplier_confirmations
  set status = 'withdrawn',
      withdrawn_at = pg_catalog.clock_timestamp(),
      withdrawn_by = p_withdrawn_by
  where confirmation_id = p_confirmation_id and status = 'active';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$withdraw_supplier_confirmation$;

-- The supplier assignment for a unit: the LATEST active, unexpired
-- confirmation, or null. Null is the fail-closed answer the order flow
-- already refuses on (SUPPLIER_UNAVAILABLE).
create or replace function public.research_early_access_supplier_for_unit(
  p_product_id text,
  p_variant_id text,
  p_now timestamptz
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $supplier_for_unit$
  select jsonb_build_object(
    'supplierId', supplier_org,
    'supplierSku', supplier_sku
  )
  from public.research_early_access_supplier_confirmations
  where product_id = p_product_id
    and variant_id = p_variant_id
    and status = 'active'
    and (expires_at is null or expires_at > p_now)
  order by confirmed_at desc
  limit 1;
$supplier_for_unit$;

-- The full confirmation record for a unit, for the operator surface.
create or replace function public.research_early_access_supplier_confirmation_for_unit(
  p_product_id text,
  p_variant_id text,
  p_now timestamptz
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $supplier_confirmation_for_unit$
  select record
  from public.research_early_access_supplier_confirmations
  where product_id = p_product_id
    and variant_id = p_variant_id
    and status = 'active'
    and (expires_at is null or expires_at > p_now)
  order by confirmed_at desc
  limit 1;
$supplier_confirmation_for_unit$;

-- Record one manual action. 'recorded' or 'duplicate' (deterministic id).
create or replace function public.research_early_access_record_manual_action(
  p_record jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_manual_action$
begin
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'research_early_access_record_manual_action: record must be a jsonb object';
  end if;
  insert into public.research_early_access_manual_actions
    (action_id, kind, subject_id, actor, at, channel, external_reference,
     prior_status, new_status, record)
  values (
    p_record ->> 'id',
    p_record ->> 'kind',
    p_record ->> 'subjectId',
    p_record ->> 'actor',
    (p_record ->> 'at')::timestamptz,
    p_record ->> 'channel',
    p_record ->> 'externalReference',
    p_record ->> 'priorStatus',
    p_record ->> 'newStatus',
    p_record
  );
  return 'recorded';
exception
  when unique_violation then
    return 'duplicate';
end;
$record_manual_action$;

create or replace function public.research_early_access_manual_actions_for_subject(
  p_subject_id text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $manual_actions_for_subject$
  select coalesce(jsonb_agg(record order by at, action_id), '[]'::jsonb)
  from public.research_early_access_manual_actions
  where subject_id = p_subject_id;
$manual_actions_for_subject$;

-- True when an ACTIVE allowlist row covers the destination: either the whole
-- country, or the exact region. An empty table is false for everything.
create or replace function public.research_early_access_shipping_serves(
  p_country text,
  p_region text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $shipping_serves$
  select exists (
    select 1 from public.research_early_access_shipping_regions
    where active
      and country = p_country
      and (region is null or region = p_region)
  );
$shipping_serves$;

-- Allow (or re-activate) one destination.
create or replace function public.research_early_access_allow_shipping_region(
  p_country text,
  p_region text,
  p_added_by text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $allow_shipping_region$
begin
  insert into public.research_early_access_shipping_regions (country, region, active, added_by)
  values (p_country, p_region, true, p_added_by)
  on conflict (country, coalesce(region, '*')) do update
    set active = true, added_by = excluded.added_by;
  return true;
end;
$allow_shipping_region$;

-- ---------------------------------------------------------------------------
-- Function privileges: service_role and nobody else
-- ---------------------------------------------------------------------------

do $function_grants$
declare
  v_role text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.research_early_access_supplier_block_mutation()',
    'public.research_early_access_record_supplier_confirmation(jsonb)',
    'public.research_early_access_withdraw_supplier_confirmation(text,text)',
    'public.research_early_access_supplier_for_unit(text,text,timestamptz)',
    'public.research_early_access_supplier_confirmation_for_unit(text,text,timestamptz)',
    'public.research_early_access_record_manual_action(jsonb)',
    'public.research_early_access_manual_actions_for_subject(text)',
    'public.research_early_access_shipping_serves(text,text)',
    'public.research_early_access_allow_shipping_region(text,text,text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', v_signature);
    foreach v_role in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
        execute pg_catalog.format('revoke all on function %s from %I', v_signature, v_role);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
       and v_signature <> 'public.research_early_access_supplier_block_mutation()' then
      execute pg_catalog.format('grant execute on function %s to service_role', v_signature);
    end if;
  end loop;
end
$function_grants$;
