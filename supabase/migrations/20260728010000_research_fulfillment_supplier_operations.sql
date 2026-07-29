-- Website 4 post-takeover, commit 1: supplier-isolated fulfillment.
--
-- This migration is independently additive after the deployed Wave 2/3 chain.
-- It does not compose checkout or orders. Fulfillment rows may only be created
-- from a finalized canonical inventory reservation and its exact-lot
-- allocations. All mutation is through the reviewed commands below.

create extension if not exists pgcrypto;

create table if not exists public.research_fulfillment_suppliers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) between 2 and 120),
  legal_name text not null check (length(btrim(legal_name)) between 2 and 200),
  state text not null check (state in ('onboarding','under_review','active','paused','disabled')),
  provider_mode text not null check (provider_mode in ('disabled','capture','live')),
  agreement_reference text,
  agreement_verified_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_by uuid not null,
  created_at timestamptz not null,
  updated_by uuid not null,
  updated_at timestamptz not null,
  constraint research_fulfillment_supplier_live_evidence check (
    provider_mode <> 'live'
    or (
      state = 'active'
      and agreement_reference is not null
      and agreement_verified_at is not null
    )
  )
);

create table if not exists public.research_fulfillment_supplier_users (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.research_fulfillment_suppliers(id),
  auth_user_id uuid not null references auth.users(id),
  state text not null check (state in ('active','paused','revoked')),
  version bigint not null default 1 check (version > 0),
  created_by uuid not null,
  created_at timestamptz not null,
  updated_by uuid not null,
  updated_at timestamptz not null,
  unique (supplier_id, auth_user_id)
);

create index if not exists research_fulfillment_supplier_users_auth_idx
  on public.research_fulfillment_supplier_users(auth_user_id)
  where state = 'active';

create table if not exists public.research_supplier_offers (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.research_fulfillment_suppliers(id),
  product_id uuid not null references public.research_products(id),
  variant_id uuid not null references public.research_product_variants(id),
  sku text not null,
  state text not null check (state in ('draft','under_review','active','paused')),
  settlement_currency text check (
    settlement_currency is null or settlement_currency ~ '^[A-Z]{3}$'
  ),
  settlement_amount_cents bigint check (
    settlement_amount_cents is null or settlement_amount_cents >= 0
  ),
  agreement_reference text,
  version bigint not null default 1 check (version > 0),
  created_by uuid not null,
  created_at timestamptz not null,
  updated_by uuid not null,
  updated_at timestamptz not null,
  unique (supplier_id, product_id, variant_id, sku),
  constraint research_supplier_offer_active_evidence check (
    state <> 'active'
    or (
      settlement_currency is not null
      and settlement_amount_cents is not null
      and agreement_reference is not null
    )
  )
);

create table if not exists public.research_supplier_fulfillment_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique,
  member_id uuid not null,
  reservation_id uuid not null unique
    references public.research_lot_reservations(id),
  state text not null default 'ready'
    check (state in ('ready','assigned','in_progress','shipped','delivered','exception','cancelled')),
  recipient_name text not null check (length(btrim(recipient_name)) between 1 and 160),
  address_line1 text not null check (length(btrim(address_line1)) between 1 and 200),
  address_line2 text,
  address_city text not null check (length(btrim(address_city)) between 1 and 120),
  address_state text not null check (address_state ~ '^[A-Z]{2}$'),
  address_postal_code text not null check (length(btrim(address_postal_code)) between 3 and 20),
  address_country text not null default 'US' check (address_country = 'US'),
  recipient_phone text,
  shipping_service text not null check (length(btrim(shipping_service)) between 2 and 100),
  handling_profile text not null check (handling_profile in ('ambient','cold_chain')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.research_supplier_fulfillment_lines (
  id uuid primary key default gen_random_uuid(),
  fulfillment_order_id uuid not null
    references public.research_supplier_fulfillment_orders(id),
  sku text not null,
  quantity integer not null check (quantity > 0),
  reservation_id uuid not null references public.research_lot_reservations(id),
  unique (fulfillment_order_id, id),
  unique (fulfillment_order_id, sku)
);

create or replace function public.research_supplier_fulfillment_paid_order_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if current_setting('xenios.paid_order_boundary', true)
       is distinct from 'allowed' then
    raise exception 'canonical paid-order fulfillment boundary is required';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists research_supplier_fulfillment_orders_paid_order_guard
  on public.research_supplier_fulfillment_orders;
create trigger research_supplier_fulfillment_orders_paid_order_guard
before insert or update or delete on public.research_supplier_fulfillment_orders
for each row execute function public.research_supplier_fulfillment_paid_order_guard();

drop trigger if exists research_supplier_fulfillment_lines_paid_order_guard
  on public.research_supplier_fulfillment_lines;
create trigger research_supplier_fulfillment_lines_paid_order_guard
before insert or update or delete on public.research_supplier_fulfillment_lines
for each row execute function public.research_supplier_fulfillment_paid_order_guard();

create table if not exists public.research_fulfillment_assignments (
  id uuid primary key default gen_random_uuid(),
  fulfillment_order_id uuid not null unique
    references public.research_supplier_fulfillment_orders(id),
  supplier_id uuid not null references public.research_fulfillment_suppliers(id),
  supplier_offer_id uuid not null references public.research_supplier_offers(id),
  state text not null check (state in (
    'assigned','acknowledged','picking','packed','shipped','delivered',
    'exception','returned','damaged','lost','recalled','cancelled'
  )),
  expected_ship_at timestamptz,
  label_reference text,
  carrier text,
  shipping_service text,
  tracking_reference text,
  reason text,
  version bigint not null default 1 check (version > 0),
  created_by uuid not null,
  created_at timestamptz not null,
  updated_by uuid not null,
  updated_at timestamptz not null
);

create index if not exists research_fulfillment_assignments_supplier_queue_idx
  on public.research_fulfillment_assignments(supplier_id, state, updated_at);

create table if not exists public.research_fulfillment_assignment_lines (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.research_fulfillment_assignments(id),
  fulfillment_line_id uuid not null references public.research_supplier_fulfillment_lines(id),
  reservation_id uuid not null references public.research_lot_reservations(id),
  reservation_allocation_id uuid not null
    references public.research_lot_reservation_allocations(id),
  lot_id uuid not null references public.research_inventory_lots(id),
  sku text not null,
  quantity integer not null check (quantity > 0),
  unique (assignment_id, fulfillment_line_id, reservation_allocation_id),
  unique (reservation_allocation_id)
);

create table if not exists public.research_fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.research_fulfillment_assignments(id),
  supplier_id uuid references public.research_fulfillment_suppliers(id),
  action text not null,
  idempotency_key_hash text not null unique
    check (length(idempotency_key_hash) = 64),
  command_hash text not null check (length(command_hash) = 64),
  actor_scope_hash text not null check (length(actor_scope_hash) = 64),
  prior_version bigint not null check (prior_version >= 0),
  result_version bigint not null check (result_version > 0),
  redacted_result jsonb not null check (jsonb_typeof(redacted_result) = 'object'),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create index if not exists research_fulfillment_events_assignment_idx
  on public.research_fulfillment_events(assignment_id, occurred_at desc);

create table if not exists public.research_fulfillment_exceptions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.research_fulfillment_assignments(id),
  kind text not null check (kind in ('exception','return','damage','loss','recall')),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  assignment_version bigint not null check (assignment_version > 1),
  recorded_by uuid not null,
  occurred_at timestamptz not null
);

create table if not exists public.research_supplier_settlements (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.research_fulfillment_suppliers(id),
  assignment_id uuid not null references public.research_fulfillment_assignments(id),
  offer_id uuid not null references public.research_supplier_offers(id),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  agreement_reference text not null,
  external_reference text,
  state text not null default 'recorded' check (state = 'recorded'),
  version bigint not null default 1 check (version = 1),
  recorded_by uuid not null,
  recorded_at timestamptz not null,
  unique (assignment_id, offer_id)
);

create table if not exists public.research_supplier_settlement_events (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.research_supplier_settlements(id),
  supplier_id uuid not null references public.research_fulfillment_suppliers(id),
  action text not null check (action = 'record'),
  idempotency_key_hash text not null unique check (length(idempotency_key_hash) = 64),
  command_hash text not null check (length(command_hash) = 64),
  actor_scope_hash text not null check (length(actor_scope_hash) = 64),
  redacted_result jsonb not null check (jsonb_typeof(redacted_result) = 'object'),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create or replace function public.research_fulfillment_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'fulfillment audit and settlement records are immutable';
end;
$$;

drop trigger if exists research_fulfillment_events_immutable
  on public.research_fulfillment_events;
create trigger research_fulfillment_events_immutable
before update or delete on public.research_fulfillment_events
for each row execute function public.research_fulfillment_immutable();

drop trigger if exists research_settlements_immutable
  on public.research_supplier_settlements;
create trigger research_settlements_immutable
before update or delete on public.research_supplier_settlements
for each row execute function public.research_fulfillment_immutable();

drop trigger if exists research_settlement_events_immutable
  on public.research_supplier_settlement_events;
create trigger research_settlement_events_immutable
before update or delete on public.research_supplier_settlement_events
for each row execute function public.research_fulfillment_immutable();

create or replace function public.research_fulfillment_internal_actor(
  p_actor_auth_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
      from public.research_prelaunch_role_assignments r
     where r.auth_user_id = p_actor_auth_user_id
       and r.role in ('super_admin','internal_team','operations_admin')
       and r.revoked_at is null
       and (r.expires_at is null or r.expires_at > now())
  );
$$;

create or replace function public.research_fulfillment_supplier_actor(
  p_actor_auth_user_id uuid,
  p_supplier_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
      from public.research_fulfillment_supplier_users u
      join public.research_fulfillment_suppliers s on s.id = u.supplier_id
     where u.auth_user_id = p_actor_auth_user_id
       and u.supplier_id = p_supplier_id
       and u.state = 'active'
       and s.state = 'active'
  );
$$;

create or replace function public.research_fulfillment_command_hash(
  p_domain text,
  p_payload jsonb
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(extensions.digest(convert_to(p_domain || '|' || p_payload::text, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.research_fulfillment_key_hash(
  p_domain text,
  p_key text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(extensions.digest(convert_to(p_domain || '|' || p_key, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.research_fulfillment_actor_hash(
  p_actor uuid,
  p_supplier uuid default null
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(extensions.digest(convert_to(
    'xenios:fulfillment-actor:v1|' || p_actor::text || '|' || coalesce(p_supplier::text, 'internal'),
    'UTF8'
  ), 'sha256'), 'hex');
$$;

create or replace function public.research_fulfillment_list_suppliers(
  p_actor_auth_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then
    raise exception 'fulfillment actor is not authorized';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'supplierId', s.id,
      'displayName', s.display_name,
      'legalName', s.legal_name,
      'state', s.state,
      'providerMode', s.provider_mode,
      'agreementReference', s.agreement_reference,
      'agreementVerifiedAt', s.agreement_verified_at,
      'version', s.version,
      'updatedAt', s.updated_at
    ) order by s.display_name, s.id)
      from public.research_fulfillment_suppliers s
  ), '[]'::jsonb);
end;
$$;

create or replace function public.research_fulfillment_list_supplier_offers(
  p_actor_auth_user_id uuid,
  p_supplier_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if p_supplier_id is null
     or not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then
    raise exception 'fulfillment actor is not authorized';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'offerId', o.id,
      'supplierId', o.supplier_id,
      'productId', o.product_id,
      'variantId', o.variant_id,
      'sku', o.sku,
      'state', o.state,
      'settlementCurrency', o.settlement_currency,
      'settlementAmountCents', o.settlement_amount_cents,
      'agreementReference', o.agreement_reference,
      'version', o.version,
      'updatedAt', o.updated_at
    ) order by o.sku, o.id)
      from public.research_supplier_offers o
     where o.supplier_id = p_supplier_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.research_fulfillment_list_assignments(
  p_actor_auth_user_id uuid,
  p_supplier_scope_id uuid,
  p_states text[],
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if p_limit is null or p_limit not between 1 and 200
     or (
       p_states is not null
       and exists (
         select 1 from unnest(p_states) state
          where state not in (
            'assigned','acknowledged','picking','packed','shipped','delivered',
            'exception','returned','damaged','lost','recalled','cancelled'
          )
       )
     ) then
    raise exception 'fulfillment queue input is invalid';
  end if;
  if p_supplier_scope_id is null then
    if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then
      raise exception 'fulfillment actor is not authorized';
    end if;
  elsif not public.research_fulfillment_supplier_actor(
    p_actor_auth_user_id,
    p_supplier_scope_id
  ) then
    raise exception 'fulfillment queue is unavailable';
  end if;

  return coalesce((
    select jsonb_agg(entry order by updated_at, assignment_id)
      from (
        select
          a.updated_at,
          a.id as assignment_id,
          jsonb_build_object(
            'assignmentId', a.id,
            'fulfillmentOrderId', a.fulfillment_order_id,
            'orderReference', o.order_id,
            'supplierId', a.supplier_id,
            'supplierLabel', s.display_name,
            'state', a.state,
            'version', a.version,
            'expectedShipAt', a.expected_ship_at,
            'recipient', jsonb_build_object(
              'name', o.recipient_name,
              'addressLine1', o.address_line1,
              'addressLine2', o.address_line2,
              'city', o.address_city,
              'state', o.address_state,
              'postalCode', o.address_postal_code,
              'country', o.address_country,
              'phone', o.recipient_phone
            ),
            'shippingService', o.shipping_service,
            'handlingProfile', o.handling_profile,
            'lines', coalesce((
              select jsonb_agg(jsonb_build_object(
                'lineId', al.id,
                'sku', al.sku,
                'quantity', al.quantity,
                'lotId', al.lot_id,
                'lotCode', l.lot_id
              ) order by al.fulfillment_line_id, al.lot_id, al.id)
                from public.research_fulfillment_assignment_lines al
                join public.research_inventory_lots l on l.id = al.lot_id
               where al.assignment_id = a.id
            ), '[]'::jsonb),
            'labelReference', a.label_reference,
            'carrier', a.carrier,
            'trackingReference', a.tracking_reference,
            'updatedAt', a.updated_at
          ) as entry
          from public.research_fulfillment_assignments a
          join public.research_supplier_fulfillment_orders o
            on o.id = a.fulfillment_order_id
          join public.research_fulfillment_suppliers s on s.id = a.supplier_id
         where (p_supplier_scope_id is null or a.supplier_id = p_supplier_scope_id)
           and (p_states is null or a.state = any(p_states))
         order by a.updated_at, a.id
         limit p_limit
      ) scoped
  ), '[]'::jsonb);
end;
$$;

create or replace function public.research_fulfillment_replay(
  p_key_hash text,
  p_command_hash text,
  p_actor_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event public.research_fulfillment_events%rowtype;
begin
  select * into v_event
    from public.research_fulfillment_events
   where idempotency_key_hash = p_key_hash;
  if not found then return null; end if;
  if v_event.command_hash <> p_command_hash
     or v_event.actor_scope_hash <> p_actor_hash then
    raise exception 'idempotency key conflicts with another command';
  end if;
  return v_event.redacted_result || jsonb_build_object('idempotentReplay', true);
end;
$$;

create or replace function public.research_fulfillment_onboard_supplier(
  p_actor_auth_user_id uuid,
  p_display_name text,
  p_legal_name text,
  p_provider_mode text,
  p_agreement_reference text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_key_hash text;
  v_command_hash text;
  v_actor_hash text;
  v_replay jsonb;
  v_id uuid := gen_random_uuid();
  v_state text;
  v_result jsonb;
begin
  if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then
    raise exception 'fulfillment actor is not authorized';
  end if;
  if p_actor_auth_user_id is null
     or p_expected_version <> 0
     or nullif(btrim(p_display_name), '') is null
     or length(btrim(p_display_name)) > 120
     or nullif(btrim(p_legal_name), '') is null
     or length(btrim(p_legal_name)) > 200
     or p_provider_mode not in ('disabled','capture','live')
     or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$'
     or p_at is null then
    raise exception 'supplier onboarding input is invalid';
  end if;
  if p_provider_mode = 'live' and nullif(btrim(p_agreement_reference), '') is null then
    raise exception 'live supplier requires verified agreement evidence';
  end if;
  v_key_hash := public.research_fulfillment_key_hash('supplier-onboard:v1', p_idempotency_key);
  v_command_hash := public.research_fulfillment_command_hash(
    'supplier-onboard:v1',
    jsonb_build_object(
      'displayName', btrim(p_display_name),
      'legalName', btrim(p_legal_name),
      'providerMode', p_provider_mode,
      'agreementReference', nullif(btrim(p_agreement_reference), ''),
      'expectedVersion', p_expected_version,
      'at', p_at
    )
  );
  v_actor_hash := public.research_fulfillment_actor_hash(p_actor_auth_user_id);
  perform pg_advisory_xact_lock(hashtextextended('xenios:fulfillment-key:v1|' || v_key_hash, 0));
  v_replay := public.research_fulfillment_replay(v_key_hash, v_command_hash, v_actor_hash);
  if v_replay is not null then return v_replay; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:fulfillment-supplier-name:v1|' || lower(btrim(p_legal_name)),
    0
  ));
  if exists (
    select 1 from public.research_fulfillment_suppliers
     where lower(legal_name) = lower(btrim(p_legal_name))
  ) then
    raise exception 'supplier legal identity already exists';
  end if;

  v_state := case when p_provider_mode = 'live' then 'active' else 'under_review' end;
  insert into public.research_fulfillment_suppliers (
    id, display_name, legal_name, state, provider_mode,
    agreement_reference, agreement_verified_at, version,
    created_by, created_at, updated_by, updated_at
  ) values (
    v_id, btrim(p_display_name), btrim(p_legal_name), v_state, p_provider_mode,
    nullif(btrim(p_agreement_reference), ''),
    case when p_provider_mode = 'live' then p_at else null end,
    1, p_actor_auth_user_id, p_at, p_actor_auth_user_id, p_at
  );
  v_result := jsonb_build_object(
    'recordId', v_id, 'state', v_state, 'version', 1, 'idempotentReplay', false
  );
  insert into public.research_fulfillment_events (
    supplier_id, action, idempotency_key_hash, command_hash, actor_scope_hash,
    prior_version, result_version, redacted_result, occurred_at
  ) values (
    v_id, 'supplier_onboarded', v_key_hash, v_command_hash, v_actor_hash,
    0, 1, v_result - 'idempotentReplay', p_at
  );
  return v_result;
end;
$$;

create or replace function public.research_fulfillment_assign_supplier_user(
  p_actor_auth_user_id uuid,
  p_supplier_id uuid,
  p_supplier_auth_user_id uuid,
  p_state text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_key_hash text;
  v_command_hash text;
  v_actor_hash text;
  v_replay jsonb;
  v_user public.research_fulfillment_supplier_users%rowtype;
  v_id uuid;
  v_version bigint;
  v_result jsonb;
begin
  if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then
    raise exception 'fulfillment actor is not authorized';
  end if;
  if p_supplier_id is null or p_supplier_auth_user_id is null
     or p_state not in ('active','paused','revoked')
     or p_expected_version is null or p_expected_version < 0
     or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$'
     or p_at is null then
    raise exception 'supplier user command input is invalid';
  end if;
  v_key_hash := public.research_fulfillment_key_hash('supplier-user:v1', p_idempotency_key);
  v_command_hash := public.research_fulfillment_command_hash(
    'supplier-user:v1',
    jsonb_build_object(
      'supplierId', p_supplier_id, 'authUserId', p_supplier_auth_user_id,
      'state', p_state, 'expectedVersion', p_expected_version, 'at', p_at
    )
  );
  v_actor_hash := public.research_fulfillment_actor_hash(p_actor_auth_user_id);
  perform pg_advisory_xact_lock(hashtextextended('xenios:fulfillment-key:v1|' || v_key_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:fulfillment-supplier-user:v1|' || p_supplier_id::text || '|' || p_supplier_auth_user_id::text,
    0
  ));
  v_replay := public.research_fulfillment_replay(v_key_hash, v_command_hash, v_actor_hash);
  if v_replay is not null then return v_replay; end if;

  perform 1 from public.research_fulfillment_suppliers
   where id = p_supplier_id and state = 'active'
   for update;
  if not found and p_state = 'active' then
    raise exception 'supplier is not active';
  end if;
  select * into v_user
    from public.research_fulfillment_supplier_users
   where supplier_id = p_supplier_id and auth_user_id = p_supplier_auth_user_id
   for update;
  if found then
    if v_user.version <> p_expected_version then
      raise exception 'supplier user version conflict';
    end if;
    update public.research_fulfillment_supplier_users
       set state = p_state, version = version + 1,
           updated_by = p_actor_auth_user_id, updated_at = p_at
     where id = v_user.id
     returning id, version into v_id, v_version;
  else
    if p_expected_version <> 0 then raise exception 'supplier user not found'; end if;
    v_id := gen_random_uuid();
    v_version := 1;
    insert into public.research_fulfillment_supplier_users (
      id, supplier_id, auth_user_id, state, version,
      created_by, created_at, updated_by, updated_at
    ) values (
      v_id, p_supplier_id, p_supplier_auth_user_id, p_state, 1,
      p_actor_auth_user_id, p_at, p_actor_auth_user_id, p_at
    );
  end if;
  v_result := jsonb_build_object(
    'recordId', v_id, 'state', p_state, 'version', v_version, 'idempotentReplay', false
  );
  insert into public.research_fulfillment_events (
    supplier_id, action, idempotency_key_hash, command_hash, actor_scope_hash,
    prior_version, result_version, redacted_result, occurred_at
  ) values (
    p_supplier_id, 'supplier_user_state', v_key_hash, v_command_hash, v_actor_hash,
    p_expected_version, v_version, v_result - 'idempotentReplay', p_at
  );
  return v_result;
end;
$$;

create or replace function public.research_fulfillment_configure_offer(
  p_actor_auth_user_id uuid,
  p_supplier_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_sku text,
  p_state text,
  p_settlement_currency text,
  p_settlement_amount_cents bigint,
  p_agreement_reference text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_key_hash text;
  v_command_hash text;
  v_actor_hash text;
  v_replay jsonb;
  v_offer public.research_supplier_offers%rowtype;
  v_id uuid;
  v_version bigint;
  v_result jsonb;
begin
  if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then
    raise exception 'fulfillment actor is not authorized';
  end if;
  if p_supplier_id is null or p_product_id is null or p_variant_id is null
     or nullif(btrim(p_sku), '') is null
     or p_state not in ('draft','under_review','active','paused')
     or p_expected_version is null or p_expected_version < 0
     or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$'
     or p_at is null then
    raise exception 'supplier offer input is invalid';
  end if;
  if p_state = 'active' and (
    p_settlement_currency !~ '^[A-Z]{3}$'
    or p_settlement_amount_cents is null or p_settlement_amount_cents < 0
    or nullif(btrim(p_agreement_reference), '') is null
  ) then
    raise exception 'active supplier offer requires approved commercial evidence';
  end if;
  v_key_hash := public.research_fulfillment_key_hash('supplier-offer:v1', p_idempotency_key);
  v_command_hash := public.research_fulfillment_command_hash(
    'supplier-offer:v1',
    jsonb_build_object(
      'supplierId', p_supplier_id, 'productId', p_product_id,
      'variantId', p_variant_id, 'sku', upper(btrim(p_sku)),
      'state', p_state, 'currency', p_settlement_currency,
      'amountCents', p_settlement_amount_cents,
      'agreementReference', nullif(btrim(p_agreement_reference), ''),
      'expectedVersion', p_expected_version, 'at', p_at
    )
  );
  v_actor_hash := public.research_fulfillment_actor_hash(p_actor_auth_user_id);
  perform pg_advisory_xact_lock(hashtextextended('xenios:fulfillment-key:v1|' || v_key_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:inventory-product-readiness:v1|' || p_product_id::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:inventory-variant-readiness:v1|' || p_variant_id::text, 0
  ));
  v_replay := public.research_fulfillment_replay(v_key_hash, v_command_hash, v_actor_hash);
  if v_replay is not null then return v_replay; end if;

  perform 1 from public.research_fulfillment_suppliers
   where id = p_supplier_id and state = 'active'
   for update;
  if not found and p_state = 'active' then raise exception 'supplier is not active'; end if;
  if p_state = 'active'
     and not public.research_inventory_product_variant_ready(
       p_product_id, p_variant_id, upper(btrim(p_sku))
     ) then
    raise exception 'supplier offer identity is not ready';
  end if;

  select * into v_offer from public.research_supplier_offers
   where supplier_id = p_supplier_id
     and product_id = p_product_id
     and variant_id = p_variant_id
     and sku = upper(btrim(p_sku))
   for update;
  if found then
    if v_offer.version <> p_expected_version then raise exception 'supplier offer version conflict'; end if;
    update public.research_supplier_offers
       set state = p_state,
           settlement_currency = upper(nullif(btrim(p_settlement_currency), '')),
           settlement_amount_cents = p_settlement_amount_cents,
           agreement_reference = nullif(btrim(p_agreement_reference), ''),
           version = version + 1, updated_by = p_actor_auth_user_id, updated_at = p_at
     where id = v_offer.id returning id, version into v_id, v_version;
  else
    if p_expected_version <> 0 then raise exception 'supplier offer not found'; end if;
    v_id := gen_random_uuid();
    v_version := 1;
    insert into public.research_supplier_offers (
      id, supplier_id, product_id, variant_id, sku, state,
      settlement_currency, settlement_amount_cents, agreement_reference,
      version, created_by, created_at, updated_by, updated_at
    ) values (
      v_id, p_supplier_id, p_product_id, p_variant_id, upper(btrim(p_sku)), p_state,
      upper(nullif(btrim(p_settlement_currency), '')), p_settlement_amount_cents,
      nullif(btrim(p_agreement_reference), ''),
      1, p_actor_auth_user_id, p_at, p_actor_auth_user_id, p_at
    );
  end if;
  v_result := jsonb_build_object(
    'recordId', v_id, 'state', p_state, 'version', v_version, 'idempotentReplay', false
  );
  insert into public.research_fulfillment_events (
    supplier_id, action, idempotency_key_hash, command_hash, actor_scope_hash,
    prior_version, result_version, redacted_result, occurred_at
  ) values (
    p_supplier_id, 'supplier_offer_configured', v_key_hash, v_command_hash, v_actor_hash,
    p_expected_version, v_version, v_result - 'idempotentReplay', p_at
  );
  return v_result;
end;
$$;

-- Order-to-fulfillment preparation remains deliberately unavailable. The
-- command may only be introduced by the canonical paid-order owner after an
-- RPC-only paid/refund boundary is frozen. Removing any prior candidate
-- signature prevents a finalized reservation from being mistaken for payment.
drop function if exists public.research_fulfillment_prepare_order(
  uuid, uuid, uuid, uuid, jsonb, text, text, bigint, text, timestamptz
);

create or replace function public.research_fulfillment_assign(
  p_actor_auth_user_id uuid,
  p_supplier_id uuid,
  p_supplier_offer_id uuid,
  p_fulfillment_order_id uuid,
  p_allocations jsonb,
  p_expected_version bigint,
  p_idempotency_key text,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_key_hash text;
  v_command_hash text;
  v_actor_hash text;
  v_replay jsonb;
  v_order public.research_supplier_fulfillment_orders%rowtype;
  v_offer public.research_supplier_offers%rowtype;
  v_lot public.research_inventory_lots%rowtype;
  v_assignment_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then
    raise exception 'fulfillment actor is not authorized';
  end if;
  if p_supplier_id is null or p_supplier_offer_id is null
     or p_fulfillment_order_id is null or p_expected_version <> 0
     or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) not between 1 and 100
     or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$'
     or p_at is null then
    raise exception 'fulfillment assignment input is invalid';
  end if;
  v_key_hash := public.research_fulfillment_key_hash('fulfillment-assign:v1', p_idempotency_key);
  v_command_hash := public.research_fulfillment_command_hash(
    'fulfillment-assign:v1',
    jsonb_build_object(
      'supplierId', p_supplier_id, 'supplierOfferId', p_supplier_offer_id,
      'fulfillmentOrderId', p_fulfillment_order_id, 'allocations', p_allocations,
      'expectedVersion', p_expected_version, 'at', p_at
    )
  );
  v_actor_hash := public.research_fulfillment_actor_hash(p_actor_auth_user_id);
  perform pg_advisory_xact_lock(hashtextextended('xenios:fulfillment-key:v1|' || v_key_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:fulfillment-order-id:v1|' || p_fulfillment_order_id::text, 0
  ));
  v_replay := public.research_fulfillment_replay(v_key_hash, v_command_hash, v_actor_hash);
  if v_replay is not null then return v_replay; end if;

  select * into v_order from public.research_supplier_fulfillment_orders
   where id = p_fulfillment_order_id for update;
  if not found or v_order.state <> 'ready' then
    raise exception 'fulfillment order is not assignable';
  end if;
  select * into v_offer from public.research_supplier_offers
   where id = p_supplier_offer_id and supplier_id = p_supplier_id
   for update;
  if not found or v_offer.state <> 'active' then
    raise exception 'supplier offer is not active';
  end if;
  perform 1 from public.research_fulfillment_suppliers
   where id = p_supplier_id and state = 'active' and provider_mode = 'live'
   for update;
  if not found then raise exception 'supplier is not live'; end if;

  if exists (
    select 1
      from jsonb_array_elements(p_allocations) item
     where jsonb_typeof(item) <> 'object'
        or coalesce(item->>'fulfillmentLineId', '') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce(item->>'reservationId', '') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce(item->>'reservationAllocationId', '') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  ) or (
    select count(*) <> count(distinct item->>'reservationAllocationId')
      from jsonb_array_elements(p_allocations) item
  ) then
    raise exception 'exact allocation input is invalid';
  end if;

  -- Product then variant then sorted lot readiness is the canonical lock order
  -- shared with reservation and readiness invalidation commands.
  perform pg_advisory_xact_lock_shared(hashtextextended(
    'xenios:inventory-product-readiness:v1|' || v_offer.product_id::text,
    0
  ));
  perform pg_advisory_xact_lock_shared(hashtextextended(
    'xenios:inventory-variant-readiness:v1|' || v_offer.variant_id::text,
    0
  ));
  if not public.research_inventory_product_variant_ready(
    v_offer.product_id, v_offer.variant_id, v_offer.sku
  ) then
    raise exception 'supplier offer product identity is not ready';
  end if;

  perform 1
    from public.research_supplier_fulfillment_lines line
   where line.fulfillment_order_id = p_fulfillment_order_id
   order by line.id
   for update;
  perform 1
    from public.research_lot_reservations reservation
   where reservation.id in (
     select distinct (item->>'reservationId')::uuid
       from jsonb_array_elements(p_allocations) item
   )
   order by reservation.id
   for update;
  perform 1
    from public.research_lot_reservation_allocations allocation
   where allocation.id in (
     select distinct (item->>'reservationAllocationId')::uuid
       from jsonb_array_elements(p_allocations) item
   )
   order by allocation.id
   for update;

  for v_lot in
    select lot.*
      from public.research_inventory_lots lot
     where lot.id in (
       select allocation.lot_uuid
         from jsonb_array_elements(p_allocations) item
         join public.research_lot_reservation_allocations allocation
           on allocation.id = (item->>'reservationAllocationId')::uuid
     )
     order by lot.id
     for update
  loop
    if v_lot.product_id <> v_offer.product_id
       or v_lot.variant_id <> v_offer.variant_id then
      raise exception 'exact lot is outside the supplier offer';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
      'xenios:inventory-readiness:v1|' || v_lot.id::text,
      0
    ));
  end loop;

  if not public.research_inventory_product_variant_ready(
    v_offer.product_id, v_offer.variant_id, v_offer.sku
  ) then
    raise exception 'supplier offer product identity readiness changed';
  end if;
  if (
    select count(*)
      from public.research_supplier_fulfillment_lines line
     where line.fulfillment_order_id = p_fulfillment_order_id
  ) <> (
    select count(distinct (item->>'fulfillmentLineId')::uuid)
      from jsonb_array_elements(p_allocations) item
  ) then
    raise exception 'every fulfillment line requires exact-lot allocations';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_allocations) item
      left join public.research_supplier_fulfillment_lines line
        on line.id = (item->>'fulfillmentLineId')::uuid
       and line.fulfillment_order_id = p_fulfillment_order_id
      left join public.research_lot_reservations reservation
        on reservation.id = (item->>'reservationId')::uuid
      left join public.research_lot_reservation_allocations allocation
        on allocation.id = (item->>'reservationAllocationId')::uuid
       and allocation.reservation_id = reservation.id
      left join public.research_inventory_lots lot on lot.id = allocation.lot_uuid
     where line.id is null
        or reservation.id is null
        or allocation.id is null
        or lot.id is null
        or reservation.id <> line.reservation_id
        or reservation.id <> v_order.reservation_id
        or reservation.member_id <> v_order.member_id
        or reservation.status <> 'finalized'
        or reservation.sku <> line.sku
        or reservation.quantity <> line.quantity
        or lot.sku <> line.sku
        or lot.product_id <> v_offer.product_id
        or lot.variant_id <> v_offer.variant_id
        or allocation.quantity <= 0
        or not public.research_lot_quality_ready(lot.id, p_at)
  ) then
    raise exception 'exact lot is not fulfillment ready';
  end if;
  if exists (
    select 1
      from public.research_supplier_fulfillment_lines line
      left join (
        select
          (item->>'fulfillmentLineId')::uuid as line_id,
          sum(allocation.quantity)::bigint as allocated_quantity
          from jsonb_array_elements(p_allocations) item
          join public.research_lot_reservation_allocations allocation
            on allocation.id = (item->>'reservationAllocationId')::uuid
         group by (item->>'fulfillmentLineId')::uuid
      ) selected on selected.line_id = line.id
     where line.fulfillment_order_id = p_fulfillment_order_id
       and coalesce(selected.allocated_quantity, 0) <> line.quantity
  ) then
    raise exception 'summed exact-lot allocations do not match fulfillment quantity';
  end if;

  insert into public.research_fulfillment_assignments (
    id, fulfillment_order_id, supplier_id, supplier_offer_id, state, version,
    created_by, created_at, updated_by, updated_at
  ) values (
    v_assignment_id, p_fulfillment_order_id, p_supplier_id, p_supplier_offer_id,
    'assigned', 1, p_actor_auth_user_id, p_at, p_actor_auth_user_id, p_at
  );

  insert into public.research_fulfillment_assignment_lines (
    assignment_id, fulfillment_line_id, reservation_id,
    reservation_allocation_id, lot_id, sku, quantity
  )
  select
    v_assignment_id,
    line.id,
    reservation.id,
    allocation.id,
    lot.id,
    line.sku,
    allocation.quantity
    from jsonb_array_elements(p_allocations) item
    join public.research_supplier_fulfillment_lines line
      on line.id = (item->>'fulfillmentLineId')::uuid
     and line.fulfillment_order_id = p_fulfillment_order_id
    join public.research_lot_reservations reservation
      on reservation.id = (item->>'reservationId')::uuid
    join public.research_lot_reservation_allocations allocation
      on allocation.id = (item->>'reservationAllocationId')::uuid
     and allocation.reservation_id = reservation.id
    join public.research_inventory_lots lot on lot.id = allocation.lot_uuid
   order by line.id, lot.id, allocation.id;

  perform set_config('xenios.paid_order_boundary', 'allowed', true);
  update public.research_supplier_fulfillment_orders
     set state = 'assigned', version = version + 1, updated_at = p_at
   where id = p_fulfillment_order_id;
  perform set_config('xenios.paid_order_boundary', '', true);
  v_result := jsonb_build_object(
    'assignmentId', v_assignment_id, 'state', 'assigned',
    'version', 1, 'idempotentReplay', false
  );
  insert into public.research_fulfillment_events (
    assignment_id, supplier_id, action, idempotency_key_hash, command_hash,
    actor_scope_hash, prior_version, result_version, redacted_result, occurred_at
  ) values (
    v_assignment_id, p_supplier_id, 'assigned', v_key_hash, v_command_hash,
    v_actor_hash, 0, 1, v_result - 'idempotentReplay', p_at
  );
  return v_result;
end;
$$;

create or replace function public.research_fulfillment_transition(
  p_actor_auth_user_id uuid,
  p_supplier_scope_id uuid,
  p_assignment_id uuid,
  p_action text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_at timestamptz,
  p_expected_ship_at timestamptz,
  p_label_reference text,
  p_carrier text,
  p_service text,
  p_tracking_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_key_hash text;
  v_command_hash text;
  v_actor_hash text;
  v_replay jsonb;
  v_assignment public.research_fulfillment_assignments%rowtype;
  v_next text;
  v_result jsonb;
  v_exception_kind text;
  v_product_id uuid;
  v_variant_id uuid;
  v_lot public.research_inventory_lots%rowtype;
begin
  if p_assignment_id is null or p_expected_version is null or p_expected_version <= 0
     or p_action not in (
       'acknowledge','start_picking','pack','ship','deliver','record_exception',
       'record_return','record_damage','record_loss','record_recall','cancel'
     )
     or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$'
     or p_at is null then
    raise exception 'fulfillment transition input is invalid';
  end if;
  v_key_hash := public.research_fulfillment_key_hash('fulfillment-transition:v1', p_idempotency_key);
  v_command_hash := public.research_fulfillment_command_hash(
    'fulfillment-transition:v1',
    jsonb_build_object(
      'assignmentId', p_assignment_id, 'action', p_action,
      'expectedVersion', p_expected_version, 'at', p_at,
      'expectedShipAt', p_expected_ship_at,
      'labelReference', nullif(btrim(p_label_reference), ''),
      'carrier', nullif(btrim(p_carrier), ''), 'service', nullif(btrim(p_service), ''),
      'trackingReference', nullif(btrim(p_tracking_reference), ''),
      'reason', nullif(btrim(p_reason), '')
    )
  );
  v_actor_hash := public.research_fulfillment_actor_hash(
    p_actor_auth_user_id, p_supplier_scope_id
  );
  perform pg_advisory_xact_lock(hashtextextended('xenios:fulfillment-key:v1|' || v_key_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:fulfillment-assignment:v1|' || p_assignment_id::text, 0
  ));

  select * into v_assignment from public.research_fulfillment_assignments
   where id = p_assignment_id for update;
  if not found then raise exception 'fulfillment assignment is unavailable'; end if;
  if p_supplier_scope_id is null then
    if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then
      raise exception 'fulfillment actor is not authorized';
    end if;
  elsif v_assignment.supplier_id <> p_supplier_scope_id
     or not public.research_fulfillment_supplier_actor(
       p_actor_auth_user_id, p_supplier_scope_id
     ) then
    raise exception 'fulfillment assignment is unavailable';
  end if;

  v_replay := public.research_fulfillment_replay(v_key_hash, v_command_hash, v_actor_hash);
  if v_replay is not null then return v_replay; end if;
  if v_assignment.version <> p_expected_version then
    raise exception 'fulfillment assignment version conflict';
  end if;
  if p_at < v_assignment.updated_at then raise exception 'fulfillment timestamp is backdated'; end if;
  v_next := case
    when v_assignment.state = 'assigned' and p_action = 'acknowledge' then 'acknowledged'
    when v_assignment.state = 'acknowledged' and p_action = 'start_picking' then 'picking'
    when v_assignment.state = 'picking' and p_action = 'pack' then 'packed'
    when v_assignment.state = 'packed' and p_action = 'ship' then 'shipped'
    when v_assignment.state = 'shipped' and p_action = 'deliver' then 'delivered'
    when v_assignment.state in ('assigned','acknowledged','picking','packed','shipped')
      and p_action = 'record_exception' then 'exception'
    when v_assignment.state in ('shipped','delivered','exception')
      and p_action = 'record_return' then 'returned'
    when v_assignment.state in ('picking','packed','shipped','delivered','exception')
      and p_action = 'record_damage' then 'damaged'
    when v_assignment.state in ('picking','packed','shipped','delivered','exception')
      and p_action = 'record_loss' then 'lost'
    when v_assignment.state not in ('returned','damaged','lost','recalled','cancelled')
      and p_action = 'record_recall' then 'recalled'
    when v_assignment.state in ('assigned','acknowledged','exception')
      and p_action = 'cancel' then 'cancelled'
    when v_assignment.state = 'exception' and p_action = 'start_picking' then 'picking'
    when v_assignment.state = 'exception' and p_action = 'pack' then 'packed'
    when v_assignment.state = 'exception' and p_action = 'ship' then 'shipped'
    else null
  end;
  if v_next is null then raise exception 'invalid fulfillment state transition'; end if;
  if p_action in ('record_exception','record_return','record_damage','record_loss','record_recall','cancel')
     and (nullif(btrim(p_reason), '') is null or length(btrim(p_reason)) not between 3 and 500) then
    raise exception 'fulfillment exception action requires a reason';
  end if;
  if p_action = 'pack' and nullif(btrim(p_label_reference), '') is null then
    raise exception 'packing requires a label reference';
  end if;
  if p_action = 'ship' and (
    nullif(btrim(coalesce(p_label_reference, v_assignment.label_reference)), '') is null
    or nullif(btrim(p_carrier), '') is null
    or nullif(btrim(p_service), '') is null
    or nullif(btrim(p_tracking_reference), '') is null
  ) then
    raise exception 'shipping evidence is incomplete';
  end if;
  if p_action in ('pack','ship') then
    for v_product_id in
      select distinct lot.product_id
        from public.research_fulfillment_assignment_lines line
        join public.research_inventory_lots lot on lot.id = line.lot_id
       where line.assignment_id = p_assignment_id
       order by lot.product_id
    loop
      perform pg_advisory_xact_lock_shared(hashtextextended(
        'xenios:inventory-product-readiness:v1|' || v_product_id::text, 0
      ));
    end loop;
    for v_variant_id in
      select distinct lot.variant_id
        from public.research_fulfillment_assignment_lines line
        join public.research_inventory_lots lot on lot.id = line.lot_id
       where line.assignment_id = p_assignment_id
       order by lot.variant_id
    loop
      perform pg_advisory_xact_lock_shared(hashtextextended(
        'xenios:inventory-variant-readiness:v1|' || v_variant_id::text, 0
      ));
    end loop;
    for v_lot in
      select lot.*
        from public.research_inventory_lots lot
       where lot.id in (
         select line.lot_id
           from public.research_fulfillment_assignment_lines line
          where line.assignment_id = p_assignment_id
       )
       order by lot.id
       for update
    loop
      perform pg_advisory_xact_lock(hashtextextended(
        'xenios:inventory-readiness:v1|' || v_lot.id::text, 0
      ));
      if not public.research_inventory_product_variant_ready(
           v_lot.product_id, v_lot.variant_id, v_lot.sku
         )
         or not public.research_lot_quality_ready(v_lot.id, p_at) then
        raise exception 'exact-lot quality evidence is no longer valid';
      end if;
    end loop;
  end if;

  update public.research_fulfillment_assignments
     set state = v_next,
         expected_ship_at = coalesce(p_expected_ship_at, expected_ship_at),
         label_reference = coalesce(nullif(btrim(p_label_reference), ''), label_reference),
         carrier = coalesce(nullif(btrim(p_carrier), ''), carrier),
         shipping_service = coalesce(nullif(btrim(p_service), ''), shipping_service),
         tracking_reference = coalesce(nullif(btrim(p_tracking_reference), ''), tracking_reference),
         reason = coalesce(nullif(btrim(p_reason), ''), reason),
         version = version + 1, updated_by = p_actor_auth_user_id, updated_at = p_at
   where id = p_assignment_id
   returning * into v_assignment;
  if v_next in ('exception','returned','damaged','lost','recalled') then
    v_exception_kind := case v_next
      when 'returned' then 'return'
      else v_next
    end;
    insert into public.research_fulfillment_exceptions (
      assignment_id, kind, reason, assignment_version, recorded_by, occurred_at
    ) values (
      p_assignment_id, v_exception_kind, btrim(p_reason),
      v_assignment.version, p_actor_auth_user_id, p_at
    );
  end if;
  perform set_config('xenios.paid_order_boundary', 'allowed', true);
  update public.research_supplier_fulfillment_orders
     set state = case
       when v_next in ('assigned') then 'assigned'
       when v_next in ('acknowledged','picking','packed') then 'in_progress'
       when v_next in ('shipped','delivered','exception','cancelled') then v_next
       else 'exception'
     end,
     version = version + 1, updated_at = p_at
   where id = v_assignment.fulfillment_order_id;
  perform set_config('xenios.paid_order_boundary', '', true);
  v_result := jsonb_build_object(
    'assignmentId', p_assignment_id, 'state', v_next,
    'version', v_assignment.version, 'idempotentReplay', false
  );
  insert into public.research_fulfillment_events (
    assignment_id, supplier_id, action, idempotency_key_hash, command_hash,
    actor_scope_hash, prior_version, result_version, redacted_result, occurred_at
  ) values (
    p_assignment_id, v_assignment.supplier_id, p_action, v_key_hash, v_command_hash,
    v_actor_hash, p_expected_version, v_assignment.version,
    v_result - 'idempotentReplay', p_at
  );
  return v_result;
end;
$$;

create or replace function public.research_fulfillment_record_settlement(
  p_actor_auth_user_id uuid,
  p_supplier_id uuid,
  p_assignment_id uuid,
  p_offer_id uuid,
  p_amount_cents bigint,
  p_currency text,
  p_agreement_reference text,
  p_external_reference text,
  p_idempotency_key text,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_key_hash text;
  v_command_hash text;
  v_actor_hash text;
  v_event public.research_supplier_settlement_events%rowtype;
  v_assignment public.research_fulfillment_assignments%rowtype;
  v_offer public.research_supplier_offers%rowtype;
  v_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then
    raise exception 'settlement actor is not authorized';
  end if;
  if p_supplier_id is null or p_assignment_id is null or p_offer_id is null
     or p_amount_cents is null or p_amount_cents < 0
     or p_currency !~ '^[A-Z]{3}$'
     or nullif(btrim(p_agreement_reference), '') is null
     or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$'
     or p_at is null then
    raise exception 'supplier settlement input is invalid';
  end if;
  v_key_hash := public.research_fulfillment_key_hash('supplier-settlement:v1', p_idempotency_key);
  v_command_hash := public.research_fulfillment_command_hash(
    'supplier-settlement:v1',
    jsonb_build_object(
      'supplierId', p_supplier_id, 'assignmentId', p_assignment_id,
      'offerId', p_offer_id, 'amountCents', p_amount_cents,
      'currency', p_currency, 'agreementReference', btrim(p_agreement_reference),
      'externalReference', nullif(btrim(p_external_reference), ''), 'at', p_at
    )
  );
  v_actor_hash := public.research_fulfillment_actor_hash(p_actor_auth_user_id);
  perform pg_advisory_xact_lock(hashtextextended('xenios:fulfillment-key:v1|' || v_key_hash, 0));
  select * into v_event from public.research_supplier_settlement_events
   where idempotency_key_hash = v_key_hash;
  if found then
    if v_event.command_hash <> v_command_hash
       or v_event.actor_scope_hash <> v_actor_hash then
      raise exception 'idempotency key conflicts with another settlement';
    end if;
    return v_event.redacted_result || jsonb_build_object('idempotentReplay', true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:fulfillment-assignment:v1|' || p_assignment_id::text, 0
  ));
  select * into v_assignment from public.research_fulfillment_assignments
   where id = p_assignment_id for update;
  if not found
     or v_assignment.supplier_id <> p_supplier_id
     or v_assignment.supplier_offer_id <> p_offer_id
     or v_assignment.state <> 'delivered' then
    raise exception 'assignment is not settlement eligible';
  end if;
  select * into v_offer from public.research_supplier_offers
   where id = p_offer_id and supplier_id = p_supplier_id for update;
  if not found
     or v_offer.state <> 'active'
     or v_offer.settlement_amount_cents <> p_amount_cents
     or v_offer.settlement_currency <> p_currency
     or v_offer.agreement_reference <> btrim(p_agreement_reference) then
    raise exception 'settlement does not match the approved supplier offer';
  end if;
  if exists (
    select 1 from public.research_supplier_settlements
     where assignment_id = p_assignment_id and offer_id = p_offer_id
  ) then
    raise exception 'assignment settlement already exists';
  end if;
  insert into public.research_supplier_settlements (
    id, supplier_id, assignment_id, offer_id, amount_cents, currency,
    agreement_reference, external_reference, state, version, recorded_by, recorded_at
  ) values (
    v_id, p_supplier_id, p_assignment_id, p_offer_id, p_amount_cents, p_currency,
    btrim(p_agreement_reference), nullif(btrim(p_external_reference), ''),
    'recorded', 1, p_actor_auth_user_id, p_at
  );
  v_result := jsonb_build_object(
    'recordId', v_id, 'state', 'recorded', 'version', 1, 'idempotentReplay', false
  );
  insert into public.research_supplier_settlement_events (
    settlement_id, supplier_id, action, idempotency_key_hash, command_hash,
    actor_scope_hash, redacted_result, occurred_at
  ) values (
    v_id, p_supplier_id, 'record', v_key_hash, v_command_hash,
    v_actor_hash, v_result - 'idempotentReplay', p_at
  );
  return v_result;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'research_fulfillment_suppliers',
    'research_fulfillment_supplier_users',
    'research_supplier_offers',
    'research_supplier_fulfillment_orders',
    'research_supplier_fulfillment_lines',
    'research_fulfillment_assignments',
    'research_fulfillment_assignment_lines',
    'research_fulfillment_events',
    'research_fulfillment_exceptions',
    'research_supplier_settlements',
    'research_supplier_settlement_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      v_table
    );
    execute format('grant select on table public.%I to service_role', v_table);
  end loop;
end;
$$;

revoke all on function public.research_fulfillment_immutable() from public, anon, authenticated, service_role;
revoke all on function public.research_supplier_fulfillment_paid_order_guard() from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_internal_actor(uuid) from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_supplier_actor(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_command_hash(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_key_hash(text, text) from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_actor_hash(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_replay(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_list_suppliers(uuid) from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_list_supplier_offers(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_list_assignments(uuid, uuid, text[], integer) from public, anon, authenticated, service_role;

revoke all on function public.research_fulfillment_onboard_supplier(
  uuid, text, text, text, text, bigint, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_assign_supplier_user(
  uuid, uuid, uuid, text, bigint, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_configure_offer(
  uuid, uuid, uuid, uuid, text, text, text, bigint, text, bigint, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_assign(
  uuid, uuid, uuid, uuid, jsonb, bigint, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_transition(
  uuid, uuid, uuid, text, bigint, text, timestamptz,
  timestamptz, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.research_fulfillment_record_settlement(
  uuid, uuid, uuid, uuid, bigint, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.research_fulfillment_onboard_supplier(
  uuid, text, text, text, text, bigint, text, timestamptz
) to service_role;
grant execute on function public.research_fulfillment_assign_supplier_user(
  uuid, uuid, uuid, text, bigint, text, timestamptz
) to service_role;
grant execute on function public.research_fulfillment_configure_offer(
  uuid, uuid, uuid, uuid, text, text, text, bigint, text, bigint, text, timestamptz
) to service_role;
grant execute on function public.research_fulfillment_list_suppliers(uuid) to service_role;
grant execute on function public.research_fulfillment_list_supplier_offers(uuid, uuid) to service_role;
grant execute on function public.research_fulfillment_list_assignments(uuid, uuid, text[], integer) to service_role;
grant execute on function public.research_fulfillment_assign(
  uuid, uuid, uuid, uuid, jsonb, bigint, text, timestamptz
) to service_role;
grant execute on function public.research_fulfillment_transition(
  uuid, uuid, uuid, text, bigint, text, timestamptz,
  timestamptz, text, text, text, text, text
) to service_role;
grant execute on function public.research_fulfillment_record_settlement(
  uuid, uuid, uuid, uuid, bigint, text, text, text, text, timestamptz
) to service_role;
