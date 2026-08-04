-- Early Access commerce persistence: the durable unit of work.
--
-- The in-memory `EarlyAccessCommerceStore` states its own contract: "a real
-- implementation maps each commit* to one SQL transaction with the unique
-- constraints named on each record, and nothing about the routes changes."
-- This migration is that implementation. Each commit function below is one
-- transaction that either writes every fact or writes none, with the
-- exactly-once guarantees moved from single-JS-turn atomicity to row locks
-- and unique constraints, where they survive restarts and second instances.
--
-- WHAT BECOMES DURABLE HERE. Placements (orders), immutable order lines,
-- immutable money snapshots, invoices with their derived payment references,
-- reservations (persisted BEFORE the invoice inside the same transaction),
-- payment proofs and their private-object reservations, settlements (the
-- eight-fact bundle: verification, receipt, ledger entry, supplier order,
-- outbox, commission hold), dispatch events, tracking, fulfillments, the
-- founder release ledger, the audit trail, and admin exceptions.
--
-- ACCESS SHAPE. Identical to the identity migration: RLS enabled and forced
-- with zero policies, all table privileges revoked from every role including
-- service_role. The SECURITY DEFINER functions are the only door, granted to
-- service_role alone. Money tables additionally carry append-only triggers,
-- so even the owner cannot rewrite a ledger row: a correction is a new fact.
--
-- ROUND-TRIP SHAPE. The TypeScript domain object is canonical. Every row
-- carries it as `record jsonb`; the columns the database must judge
-- (uniqueness, money arithmetic, sequences, state vocabulary) are extracted
-- beside it and kept in sync inside the same transaction. Reads return
-- `record` verbatim.
--
-- This migration is ADDITIVE and may be applied twice without effect.

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
      'research_early_access_placements',
      'research_early_access_order_lines',
      'research_early_access_money_snapshots',
      'research_early_access_invoices',
      'research_early_access_reservations',
      'research_early_access_payment_proofs',
      'research_early_access_proof_objects',
      'research_early_access_settlements',
      'research_early_access_verifications',
      'research_early_access_receipts',
      'research_early_access_ledger_entries',
      'research_early_access_supplier_orders',
      'research_early_access_outbox',
      'research_early_access_commission_events',
      'research_early_access_dispatch_events',
      'research_early_access_tracking',
      'research_early_access_fulfillments',
      'research_early_access_audit_events',
      'research_early_access_releases',
      'research_early_access_admin_exceptions'
    );
  if v_tables not in (0, 20) then
    raise exception
      'research_early_access commerce persistence is partially installed: % of 20 tables exist. Resolve manually before re-applying.',
      v_tables;
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Tables: the order and its money
-- ---------------------------------------------------------------------------

create table if not exists public.research_early_access_placements (
  order_number text primary key
    constraint research_early_access_placements_order_number_shape
    check (length(order_number) between 4 and 64),
  idempotency_key text not null
    constraint research_early_access_placements_idempotency_shape
    check (length(idempotency_key) between 1 and 128),
  customer_ref text not null
    constraint research_early_access_placements_customer_shape
    check (customer_ref ~ '^eac_[a-f0-9]{32}$'),
  payment_state text not null
    constraint research_early_access_placements_state_vocabulary
    check (payment_state in ('awaiting_payment', 'under_review', 'payment_verified', 'payment_rejected')),
  placed_at timestamptz not null,
  record jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_early_access_placements_idempotency_unique unique (idempotency_key),
  constraint research_early_access_placements_record_agrees
    check (
      record ->> 'orderNumber' = order_number
      and record ->> 'idempotencyKey' = idempotency_key
      and record ->> 'customerRef' = customer_ref
      and record ->> 'paymentState' = payment_state
    )
);

comment on table public.research_early_access_placements is
  'Early Access placements: one row per order, canonical jsonb record, payment state kept in sync by the commit functions alone.';

-- The immutable order line, extracted at commit into first-class columns so
-- the sale''s facts are durable rows, not only a path inside a document.
create table if not exists public.research_early_access_order_lines (
  order_number text primary key
    references public.research_early_access_placements (order_number),
  product_id text not null,
  variant_id text not null,
  sku text not null,
  quantity integer not null
    constraint research_early_access_order_lines_quantity_positive
    check (quantity > 0),
  unit_price_cents integer not null
    constraint research_early_access_order_lines_price_positive
    check (unit_price_cents > 0),
  line_total_cents integer not null,
  currency text not null
    constraint research_early_access_order_lines_currency_shape
    check (currency ~ '^[A-Z]{3}$'),
  priced_at timestamptz not null,
  constraint research_early_access_order_lines_total_arithmetic
    check (line_total_cents = quantity * unit_price_cents)
);

-- The immutable money snapshot. The payable total is the amount owed; the
-- arithmetic is a table constraint so no write path can bend it.
create table if not exists public.research_early_access_money_snapshots (
  order_number text primary key
    references public.research_early_access_placements (order_number),
  currency text not null
    constraint research_early_access_money_currency_shape
    check (currency ~ '^[A-Z]{3}$'),
  subtotal_cents integer not null
    constraint research_early_access_money_subtotal_range check (subtotal_cents >= 0),
  discount_cents integer not null
    constraint research_early_access_money_discount_range check (discount_cents >= 0),
  shipping_cents integer not null
    constraint research_early_access_money_shipping_range check (shipping_cents >= 0),
  tax_cents integer not null
    constraint research_early_access_money_tax_range check (tax_cents >= 0),
  payable_total_cents integer not null
    constraint research_early_access_money_payable_range check (payable_total_cents >= 0),
  promotion_id text,
  promotion_version text,
  constraint research_early_access_money_arithmetic
    check (payable_total_cents = subtotal_cents - discount_cents + shipping_cents + tax_cents)
);

create table if not exists public.research_early_access_invoices (
  invoice_number text primary key
    constraint research_early_access_invoices_number_shape
    check (length(invoice_number) between 4 and 64),
  order_number text not null
    references public.research_early_access_placements (order_number),
  payment_reference text not null
    constraint research_early_access_invoices_reference_shape
    check (length(payment_reference) between 4 and 128),
  payable_total_cents integer not null
    constraint research_early_access_invoices_payable_range check (payable_total_cents >= 0),
  currency text not null
    constraint research_early_access_invoices_currency_shape
    check (currency ~ '^[A-Z]{3}$'),
  status text not null,
  issued_at timestamptz not null,
  record jsonb not null,
  constraint research_early_access_invoices_order_unique unique (order_number),
  constraint research_early_access_invoices_reference_unique unique (payment_reference)
);

-- The reservation, persisted BEFORE the invoice inside commit_placement. The
-- expiry is optional policy; when it lapses after money was submitted, the
-- commit functions raise an admin exception rather than auto-anything.
create table if not exists public.research_early_access_reservations (
  order_number text primary key
    references public.research_early_access_placements (order_number),
  product_id text not null,
  variant_id text not null,
  quantity integer not null
    constraint research_early_access_reservations_quantity_positive check (quantity > 0),
  supplier_id text not null,
  reserved_at timestamptz not null,
  expires_at timestamptz,
  constraint research_early_access_reservations_expiry_order
    check (expires_at is null or expires_at > reserved_at)
);

-- ---------------------------------------------------------------------------
-- Tables: proofs and their private objects
-- ---------------------------------------------------------------------------

create table if not exists public.research_early_access_payment_proofs (
  proof_id text primary key
    constraint research_early_access_proofs_id_shape
    check (length(proof_id) between 4 and 128),
  order_number text not null
    references public.research_early_access_placements (order_number),
  sequence integer not null
    constraint research_early_access_proofs_sequence_positive check (sequence >= 1),
  storage_ref text not null,
  sha256 text not null
    constraint research_early_access_proofs_sha_shape
    check (sha256 ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null,
  record jsonb not null,
  constraint research_early_access_proofs_chain_unique unique (order_number, sequence)
);

-- The metadata row for a reserved private object. Bytes never pass through
-- the application; the row is the reservation, and the storage bucket is
-- private with no policies, so no URL to the object can exist publicly.
create table if not exists public.research_early_access_proof_objects (
  storage_ref text primary key
    constraint research_early_access_proof_objects_ref_shape
    check (storage_ref ~ '^eaproof\.[a-f0-9]{40}$'),
  bucket_id text not null,
  object_key text not null,
  content_type text not null
    constraint research_early_access_proof_objects_content_type
    check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size bigint not null
    constraint research_early_access_proof_objects_size_range
    check (byte_size > 0 and byte_size <= 26214400),
  sha256 text not null
    constraint research_early_access_proof_objects_sha_shape
    check (sha256 ~ '^[a-f0-9]{64}$'),
  reserved_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_early_access_proof_objects_key_unique unique (object_key)
);

-- ---------------------------------------------------------------------------
-- Tables: the settlement bundle
-- ---------------------------------------------------------------------------

create table if not exists public.research_early_access_settlements (
  order_number text primary key
    references public.research_early_access_placements (order_number),
  settled_at timestamptz not null,
  record jsonb not null
);

create table if not exists public.research_early_access_verifications (
  order_number text primary key
    references public.research_early_access_placements (order_number),
  idempotency_key text not null,
  decision text not null,
  actor_id text not null,
  decided_at timestamptz not null,
  record jsonb not null
);

create table if not exists public.research_early_access_receipts (
  receipt_id text primary key,
  order_number text not null
    references public.research_early_access_placements (order_number),
  payable_total_cents integer not null
    constraint research_early_access_receipts_amount_range check (payable_total_cents >= 0),
  currency text not null
    constraint research_early_access_receipts_currency_shape check (currency ~ '^[A-Z]{3}$'),
  issued_at timestamptz not null,
  issued_by_actor_id text not null,
  record jsonb not null,
  constraint research_early_access_receipts_order_unique unique (order_number)
);

-- The payment ledger. One arrival of money pays one order: the external
-- transaction id is globally unique, and the table is append-only by trigger.
create table if not exists public.research_early_access_ledger_entries (
  entry_id text primary key,
  order_number text not null
    references public.research_early_access_placements (order_number),
  amount_cents integer not null
    constraint research_early_access_ledger_amount_range check (amount_cents >= 0),
  currency text not null
    constraint research_early_access_ledger_currency_shape check (currency ~ '^[A-Z]{3}$'),
  external_transaction_id text not null
    constraint research_early_access_ledger_txn_shape
    check (length(external_transaction_id) between 1 and 128),
  recorded_at timestamptz not null,
  recorded_by_actor_id text not null,
  record jsonb not null,
  constraint research_early_access_ledger_order_unique unique (order_number),
  constraint research_early_access_ledger_txn_unique unique (external_transaction_id)
);

create table if not exists public.research_early_access_supplier_orders (
  release_id text primary key,
  order_number text not null
    references public.research_early_access_placements (order_number),
  supplier_id text not null,
  packet jsonb not null,
  record jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_early_access_supplier_orders_order_unique unique (order_number)
);

create table if not exists public.research_early_access_outbox (
  outbox_id text primary key,
  order_number text not null
    references public.research_early_access_placements (order_number),
  kind text not null
    constraint research_early_access_outbox_kind_vocabulary
    check (kind in ('early_access_payment_confirmed')),
  queued_at timestamptz not null,
  delivered_at timestamptz,
  record jsonb not null
);

create table if not exists public.research_early_access_commission_events (
  hold_id text primary key,
  order_number text not null
    references public.research_early_access_placements (order_number),
  affiliate_id text not null,
  referral_code text not null,
  state text not null
    constraint research_early_access_commission_state_vocabulary
    check (state in ('held')),
  hold_amount_cents integer not null
    constraint research_early_access_commission_amount_range check (hold_amount_cents >= 0),
  currency text not null
    constraint research_early_access_commission_currency_shape check (currency ~ '^[A-Z]{3}$'),
  held_at timestamptz not null,
  record jsonb not null,
  constraint research_early_access_commission_order_unique unique (order_number)
);

-- ---------------------------------------------------------------------------
-- Tables: dispatch, tracking, fulfillment
-- ---------------------------------------------------------------------------

create table if not exists public.research_early_access_dispatch_events (
  order_number text not null
    references public.research_early_access_placements (order_number),
  sequence integer not null
    constraint research_early_access_dispatch_sequence_positive check (sequence >= 1),
  kind text not null
    constraint research_early_access_dispatch_kind_vocabulary
    check (kind in ('notification_attempt', 'acknowledgement', 'packing')),
  outcome text not null
    constraint research_early_access_dispatch_outcome_vocabulary
    check (outcome in ('sent', 'failed', 'recorded')),
  actor_id text not null,
  at timestamptz not null,
  record jsonb not null,
  constraint research_early_access_dispatch_events_pk primary key (order_number, sequence)
);

create table if not exists public.research_early_access_tracking (
  order_number text not null
    references public.research_early_access_placements (order_number),
  sequence integer not null
    constraint research_early_access_tracking_sequence_positive check (sequence >= 1),
  record jsonb not null,
  constraint research_early_access_tracking_pk primary key (order_number, sequence)
);

create table if not exists public.research_early_access_fulfillments (
  order_number text primary key
    references public.research_early_access_placements (order_number),
  record jsonb not null
);

-- ---------------------------------------------------------------------------
-- Tables: audit, releases, admin exceptions
-- ---------------------------------------------------------------------------

create table if not exists public.research_early_access_audit_events (
  id bigint generated always as identity primary key,
  event text not null
    constraint research_early_access_audit_event_shape check (length(event) between 1 and 128),
  order_number text not null,
  actor text not null
    constraint research_early_access_audit_actor_named check (length(actor) between 1 and 200),
  at timestamptz not null,
  detail jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index if not exists research_early_access_audit_events_order_idx
  on public.research_early_access_audit_events (order_number, at);

-- The founder release ledger. Append-only; current state is the latest record
-- by (recorded_at, release_id), exactly as the domain decides it.
create table if not exists public.research_early_access_releases (
  release_id text primary key,
  product_id text not null,
  variant_id text not null,
  status text not null
    constraint research_early_access_releases_status_vocabulary
    check (status in ('approved', 'revoked')),
  recorded_at timestamptz not null,
  record jsonb not null
);

create index if not exists research_early_access_releases_unit_idx
  on public.research_early_access_releases (product_id, variant_id, recorded_at);

-- A human decision queue for the states nothing may handle automatically,
-- for example a reservation that lapsed after money was already submitted.
-- No auto-fulfillment, no silent refund: a named human resolves it.
create table if not exists public.research_early_access_admin_exceptions (
  id bigint generated always as identity primary key,
  kind text not null
    constraint research_early_access_exceptions_kind_shape check (length(kind) between 1 and 96),
  order_number text not null,
  detail jsonb not null default '{}'::jsonb,
  raised_at timestamptz not null default pg_catalog.clock_timestamp(),
  resolved_at timestamptz,
  resolved_by text,
  constraint research_early_access_exceptions_once unique (kind, order_number),
  constraint research_early_access_exceptions_resolution_pair
    check ((resolved_at is null) = (resolved_by is null))
);

-- ---------------------------------------------------------------------------
-- Append-only enforcement on facts and money
-- ---------------------------------------------------------------------------

create or replace function public.research_early_access_commerce_block_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $block$
begin
  raise exception 'research_early_access %.% is append-only', tg_table_schema, tg_table_name;
end;
$block$;

do $append_only$
declare
  v_table text;
begin
  foreach v_table in array array[
    'research_early_access_order_lines',
    'research_early_access_money_snapshots',
    'research_early_access_invoices',
    'research_early_access_payment_proofs',
    'research_early_access_proof_objects',
    'research_early_access_settlements',
    'research_early_access_verifications',
    'research_early_access_receipts',
    'research_early_access_ledger_entries',
    'research_early_access_supplier_orders',
    'research_early_access_commission_events',
    'research_early_access_dispatch_events',
    'research_early_access_tracking',
    'research_early_access_fulfillments',
    'research_early_access_audit_events',
    'research_early_access_releases'
  ] loop
    execute pg_catalog.format(
      'drop trigger if exists %I on public.%I',
      v_table || '_append_only', v_table
    );
    execute pg_catalog.format(
      'create trigger %I before update or delete on public.%I
         for each row execute function public.research_early_access_commerce_block_mutation()',
      v_table || '_append_only', v_table
    );
  end loop;
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
    'research_early_access_placements',
    'research_early_access_order_lines',
    'research_early_access_money_snapshots',
    'research_early_access_invoices',
    'research_early_access_reservations',
    'research_early_access_payment_proofs',
    'research_early_access_proof_objects',
    'research_early_access_settlements',
    'research_early_access_verifications',
    'research_early_access_receipts',
    'research_early_access_ledger_entries',
    'research_early_access_supplier_orders',
    'research_early_access_outbox',
    'research_early_access_commission_events',
    'research_early_access_dispatch_events',
    'research_early_access_tracking',
    'research_early_access_fulfillments',
    'research_early_access_audit_events',
    'research_early_access_releases',
    'research_early_access_admin_exceptions'
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
-- The private proof bucket
-- ---------------------------------------------------------------------------

-- Guarded: the storage schema exists on Supabase but not on a disposable
-- verification database. Private, no policies: no anon or authenticated path
-- to the objects exists, so no public URL can be minted.
do $bucket$
begin
  if pg_catalog.to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('research-ea-payment-proofs-production', 'research-ea-payment-proofs-production', false)
    on conflict (id) do nothing;
  end if;
end
$bucket$;

-- ---------------------------------------------------------------------------
-- Function: commit a placement
-- ---------------------------------------------------------------------------

-- One transaction: placement, reservation (BEFORE the invoice, deliberately),
-- immutable order line, immutable money snapshot, invoice. Returns the same
-- discriminated result the port defines, with the incumbent record on a
-- uniqueness refusal so the losing caller can answer with it.
create or replace function public.research_early_access_commit_placement(
  p_placement jsonb,
  p_reservation_ttl_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $commit_placement$
declare
  v_order jsonb;
  v_line jsonb;
  v_money jsonb;
  v_invoice jsonb;
  v_incumbent jsonb;
  v_order_number text;
  v_placed_at timestamptz;
begin
  if p_placement is null or jsonb_typeof(p_placement) <> 'object' then
    raise exception 'research_early_access_commit_placement: placement must be a jsonb object';
  end if;

  v_order_number := p_placement ->> 'orderNumber';
  v_order := p_placement -> 'order' -> 'order';
  v_line := v_order -> 'line';
  v_money := p_placement -> 'order' -> 'money';
  v_invoice := p_placement -> 'invoice';
  v_placed_at := (p_placement ->> 'placedAt')::timestamptz;

  -- The check order is part of the contract: the idempotency key is judged
  -- before the order number, exactly as the in-memory store judges it.
  select record into v_incumbent
  from public.research_early_access_placements
  where idempotency_key = p_placement ->> 'idempotencyKey';
  if found then
    return jsonb_build_object(
      'committed', false, 'reason', 'idempotency_key_taken', 'placement', v_incumbent
    );
  end if;

  select record into v_incumbent
  from public.research_early_access_placements
  where order_number = v_order_number;
  if found then
    return jsonb_build_object(
      'committed', false, 'reason', 'order_number_taken', 'placement', v_incumbent
    );
  end if;

  begin
    insert into public.research_early_access_placements
      (order_number, idempotency_key, customer_ref, payment_state, placed_at, record)
    values (
      v_order_number,
      p_placement ->> 'idempotencyKey',
      p_placement ->> 'customerRef',
      p_placement ->> 'paymentState',
      v_placed_at,
      p_placement
    );
  exception
    when unique_violation then
      -- A concurrent commit won the slot between our read and our write. Read
      -- again and answer with the incumbent, keyed the same way as above.
      select record into v_incumbent
      from public.research_early_access_placements
      where idempotency_key = p_placement ->> 'idempotencyKey';
      if found then
        return jsonb_build_object(
          'committed', false, 'reason', 'idempotency_key_taken', 'placement', v_incumbent
        );
      end if;
      select record into v_incumbent
      from public.research_early_access_placements
      where order_number = v_order_number;
      return jsonb_build_object(
        'committed', false, 'reason', 'order_number_taken', 'placement', v_incumbent
      );
  end;

  -- The reservation lands before the invoice, so at no point does an invoice
  -- (payment instructions) exist for a unit nothing has reserved.
  insert into public.research_early_access_reservations
    (order_number, product_id, variant_id, quantity, supplier_id, reserved_at, expires_at)
  values (
    v_order_number,
    v_line ->> 'productId',
    v_line ->> 'variantId',
    (v_line ->> 'quantity')::integer,
    p_placement -> 'supplier' ->> 'supplierId',
    v_placed_at,
    case
      when p_reservation_ttl_minutes is null then null
      else v_placed_at + pg_catalog.make_interval(mins => p_reservation_ttl_minutes)
    end
  );

  insert into public.research_early_access_order_lines
    (order_number, product_id, variant_id, sku, quantity, unit_price_cents,
     line_total_cents, currency, priced_at)
  values (
    v_order_number,
    v_line ->> 'productId',
    v_line ->> 'variantId',
    v_line ->> 'sku',
    (v_line ->> 'quantity')::integer,
    (v_line ->> 'unitPriceCents')::integer,
    (v_line ->> 'lineTotalCents')::integer,
    v_line ->> 'currency',
    (v_line ->> 'pricedAt')::timestamptz
  );

  insert into public.research_early_access_money_snapshots
    (order_number, currency, subtotal_cents, discount_cents, shipping_cents,
     tax_cents, payable_total_cents, promotion_id, promotion_version)
  values (
    v_order_number,
    v_money ->> 'currency',
    (v_money ->> 'subtotalCents')::integer,
    (v_money ->> 'discountCents')::integer,
    (v_money ->> 'shippingCents')::integer,
    (v_money ->> 'taxCents')::integer,
    (v_money ->> 'payableTotalCents')::integer,
    v_money ->> 'promotionId',
    v_money ->> 'promotionVersion'
  );

  insert into public.research_early_access_invoices
    (invoice_number, order_number, payment_reference, payable_total_cents,
     currency, status, issued_at, record)
  values (
    v_invoice ->> 'invoiceNumber',
    v_order_number,
    v_invoice ->> 'paymentReference',
    (v_invoice ->> 'payableTotalCents')::integer,
    v_invoice ->> 'currency',
    v_invoice ->> 'status',
    (v_invoice ->> 'issuedAt')::timestamptz,
    v_invoice
  );

  -- The invoice must promise exactly what the money snapshot owes. A drift
  -- here is a computed-money bug; no row may land recording it.
  if (v_invoice ->> 'payableTotalCents')::integer <> (v_money ->> 'payableTotalCents')::integer
     or (v_invoice ->> 'currency') <> (v_money ->> 'currency') then
    raise exception
      'research_early_access_commit_placement: invoice money disagrees with the order money snapshot for %',
      v_order_number;
  end if;

  return jsonb_build_object('committed', true, 'placement', p_placement);
end;
$commit_placement$;

-- ---------------------------------------------------------------------------
-- Function: commit a payment proof
-- ---------------------------------------------------------------------------

-- One transaction: append the proof to the chain, move awaiting_payment to
-- under_review (and NEVER further; there is structurally no path from a proof
-- to payment_verified), and raise an admin exception if money arrived after
-- the reservation lapsed. The placement row lock serializes the chain check.
create or replace function public.research_early_access_commit_proof(
  p_intake jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $commit_proof$
declare
  v_order_number text;
  v_record jsonb;
  v_state text;
  v_chain_length integer;
  v_reservation_expired boolean;
begin
  if p_intake is null or jsonb_typeof(p_intake) <> 'object' then
    raise exception 'research_early_access_commit_proof: intake must be a jsonb object';
  end if;
  v_order_number := p_intake ->> 'orderNumber';
  v_record := p_intake -> 'record';

  select payment_state into v_state
  from public.research_early_access_placements
  where order_number = v_order_number
  for update;
  if not found then
    return jsonb_build_object('committed', false, 'reason', 'order_unknown');
  end if;

  select count(*) into v_chain_length
  from public.research_early_access_payment_proofs
  where order_number = v_order_number;

  if (v_record ->> 'sequence')::integer <> v_chain_length + 1 then
    return jsonb_build_object('committed', false, 'reason', 'chain_moved');
  end if;

  begin
    insert into public.research_early_access_payment_proofs
      (proof_id, order_number, sequence, storage_ref, sha256, received_at, record)
    values (
      v_record ->> 'proofId',
      v_order_number,
      (v_record ->> 'sequence')::integer,
      v_record ->> 'storageRef',
      p_intake ->> 'sha256',
      (p_intake ->> 'receivedAt')::timestamptz,
      p_intake
    );
  exception
    when unique_violation then
      return jsonb_build_object('committed', false, 'reason', 'proof_id_taken');
  end;

  if v_state = 'awaiting_payment' then
    update public.research_early_access_placements
    set payment_state = 'under_review',
        record = jsonb_set(record, '{paymentState}', to_jsonb('under_review'::text)),
        updated_at = pg_catalog.clock_timestamp()
    where order_number = v_order_number;
  end if;

  -- Money submitted after the reservation lapsed is a human decision, never
  -- an automatic one. The exception row is raised at most once per order.
  select exists (
    select 1 from public.research_early_access_reservations
    where order_number = v_order_number
      and expires_at is not null
      and expires_at < (p_intake ->> 'receivedAt')::timestamptz
  ) into v_reservation_expired;
  if v_reservation_expired then
    insert into public.research_early_access_admin_exceptions (kind, order_number, detail)
    values (
      'reservation_expired_after_payment_submission',
      v_order_number,
      jsonb_build_object(
        'proofId', v_record ->> 'proofId',
        'receivedAt', p_intake ->> 'receivedAt'
      )
    )
    on conflict (kind, order_number) do nothing;
  end if;

  return jsonb_build_object('committed', true, 'intake', p_intake);
end;
$commit_proof$;

-- ---------------------------------------------------------------------------
-- Function: commit a settlement
-- ---------------------------------------------------------------------------

-- The exactly-once boundary for money. One transaction writes the settlement,
-- the verification, the receipt, the ledger entry, the supplier order, the
-- outbox entry, and the commission hold, and moves the placement to
-- payment_verified. The placement row lock serializes concurrent verifiers;
-- the FIRST settlement is the settlement forever, and both callers receive
-- the same record. A reused external transaction reference is refused by the
-- ledger's unique constraint. The money cross-checks raise rather than
-- refuse, because a disagreement between the settlement and the order's own
-- money snapshot is an integrity fault no caller may absorb silently.
create or replace function public.research_early_access_commit_settlement(
  p_settlement jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $commit_settlement$
declare
  v_order_number text;
  v_existing jsonb;
  v_ledger jsonb;
  v_receipt jsonb;
  v_verification jsonb;
  v_supplier_order jsonb;
  v_packet jsonb;
  v_outbox jsonb;
  v_commission jsonb;
  v_money record;
begin
  if p_settlement is null or jsonb_typeof(p_settlement) <> 'object' then
    raise exception 'research_early_access_commit_settlement: settlement must be a jsonb object';
  end if;
  v_order_number := p_settlement ->> 'orderNumber';
  v_ledger := p_settlement -> 'ledgerEntry';
  v_receipt := p_settlement -> 'receipt';
  v_verification := p_settlement -> 'verification';
  v_supplier_order := p_settlement -> 'supplierOrder';
  v_packet := p_settlement -> 'supplierPacket';
  v_outbox := p_settlement -> 'outbox';
  v_commission := p_settlement -> 'commission';

  perform 1 from public.research_early_access_placements
  where order_number = v_order_number
  for update;
  if not found then
    return jsonb_build_object(
      'committed', false, 'reason', 'order_unknown', 'settlement', null
    );
  end if;

  select record into v_existing
  from public.research_early_access_settlements
  where order_number = v_order_number;
  if found then
    return jsonb_build_object(
      'committed', false, 'reason', 'already_settled', 'settlement', v_existing
    );
  end if;

  -- One arrival of money pays one order. This order has no settlement yet, so
  -- any existing claim on this reference belongs to a different order.
  if exists (
    select 1 from public.research_early_access_ledger_entries
    where external_transaction_id = v_ledger ->> 'externalTransactionId'
  ) then
    return jsonb_build_object(
      'committed', false, 'reason', 'transaction_id_used', 'settlement', null
    );
  end if;

  -- Defense in depth: the settlement must claim exactly what the order's own
  -- immutable money snapshot says is owed, in the same currency.
  select payable_total_cents, currency into v_money
  from public.research_early_access_money_snapshots
  where order_number = v_order_number;
  if found then
    if (v_receipt ->> 'payableTotalCents')::integer <> v_money.payable_total_cents
       or (v_receipt ->> 'currency') <> v_money.currency
       or (v_ledger ->> 'currency') <> v_money.currency then
      raise exception
        'research_early_access_commit_settlement: settlement money disagrees with the money snapshot for %',
        v_order_number;
    end if;
  end if;

  insert into public.research_early_access_settlements (order_number, settled_at, record)
  values (v_order_number, (p_settlement ->> 'settledAt')::timestamptz, p_settlement);

  insert into public.research_early_access_verifications
    (order_number, idempotency_key, decision, actor_id, decided_at, record)
  values (
    v_order_number,
    v_verification ->> 'idempotencyKey',
    v_verification ->> 'decision',
    v_verification ->> 'actorId',
    (v_verification ->> 'decidedAt')::timestamptz,
    v_verification
  );

  insert into public.research_early_access_receipts
    (receipt_id, order_number, payable_total_cents, currency, issued_at,
     issued_by_actor_id, record)
  values (
    v_receipt ->> 'receiptId',
    v_order_number,
    (v_receipt ->> 'payableTotalCents')::integer,
    v_receipt ->> 'currency',
    (v_receipt ->> 'issuedAt')::timestamptz,
    v_receipt ->> 'issuedByActorId',
    v_receipt
  );

  begin
    insert into public.research_early_access_ledger_entries
      (entry_id, order_number, amount_cents, currency, external_transaction_id,
       recorded_at, recorded_by_actor_id, record)
    values (
      v_ledger ->> 'entryId',
      v_order_number,
      (v_ledger ->> 'amountCents')::integer,
      v_ledger ->> 'currency',
      v_ledger ->> 'externalTransactionId',
      (v_ledger ->> 'recordedAt')::timestamptz,
      v_ledger ->> 'recordedByActorId',
      v_ledger
    );
  exception
    when unique_violation then
      -- A concurrent settlement of a DIFFERENT order claimed the reference
      -- between our check and our insert. The whole transaction unwinds.
      raise exception using errcode = 'serialization_failure', message =
        'research_early_access_commit_settlement: external transaction reference was claimed concurrently';
  end;

  insert into public.research_early_access_supplier_orders
    (release_id, order_number, supplier_id, packet, record)
  values (
    v_supplier_order ->> 'releaseId',
    v_order_number,
    v_packet ->> 'supplierId',
    v_packet,
    v_supplier_order
  );

  insert into public.research_early_access_outbox
    (outbox_id, order_number, kind, queued_at, record)
  values (
    v_outbox ->> 'outboxId',
    v_order_number,
    v_outbox ->> 'kind',
    (v_outbox ->> 'queuedAt')::timestamptz,
    v_outbox
  );

  if v_commission is not null and jsonb_typeof(v_commission) = 'object' then
    insert into public.research_early_access_commission_events
      (hold_id, order_number, affiliate_id, referral_code, state,
       hold_amount_cents, currency, held_at, record)
    values (
      v_commission ->> 'holdId',
      v_order_number,
      v_commission ->> 'affiliateId',
      v_commission ->> 'referralCode',
      v_commission ->> 'state',
      (v_commission ->> 'holdAmountCents')::integer,
      v_commission ->> 'currency',
      (v_commission ->> 'heldAt')::timestamptz,
      v_commission
    );
  end if;

  update public.research_early_access_placements
  set payment_state = 'payment_verified',
      record = jsonb_set(record, '{paymentState}', to_jsonb('payment_verified'::text)),
      updated_at = pg_catalog.clock_timestamp()
  where order_number = v_order_number;

  return jsonb_build_object('committed', true, 'settlement', p_settlement);
end;
$commit_settlement$;

-- ---------------------------------------------------------------------------
-- Functions: dispatch, tracking, fulfillment
-- ---------------------------------------------------------------------------

-- Dispatch facts exist only after settlement, exactly as the in-memory store
-- initializes the dispatch record at settlement time and never before.
create or replace function public.research_early_access_commit_dispatch_event(
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $commit_dispatch_event$
declare
  v_order_number text;
  v_count integer;
begin
  v_order_number := p_event ->> 'orderNumber';

  perform 1 from public.research_early_access_placements
  where order_number = v_order_number
  for update;
  if not found or not exists (
    select 1 from public.research_early_access_settlements where order_number = v_order_number
  ) then
    return jsonb_build_object('committed', false, 'reason', 'not_settled');
  end if;

  select count(*) into v_count
  from public.research_early_access_dispatch_events
  where order_number = v_order_number;
  if (p_event ->> 'sequence')::integer <> v_count + 1 then
    return jsonb_build_object('committed', false, 'reason', 'sequence_moved');
  end if;

  insert into public.research_early_access_dispatch_events
    (order_number, sequence, kind, outcome, actor_id, at, record)
  values (
    v_order_number,
    (p_event ->> 'sequence')::integer,
    p_event ->> 'kind',
    p_event ->> 'outcome',
    p_event ->> 'actorId',
    (p_event ->> 'at')::timestamptz,
    p_event
  );
  return jsonb_build_object('committed', true);
end;
$commit_dispatch_event$;

create or replace function public.research_early_access_commit_tracking(
  p_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $commit_tracking$
declare
  v_order_number text;
  v_count integer;
begin
  v_order_number := p_record ->> 'orderId';

  perform 1 from public.research_early_access_placements
  where order_number = v_order_number
  for update;
  if not found or not exists (
    select 1 from public.research_early_access_settlements where order_number = v_order_number
  ) then
    return jsonb_build_object('committed', false, 'reason', 'not_settled');
  end if;

  select count(*) into v_count
  from public.research_early_access_tracking
  where order_number = v_order_number;
  if (p_record ->> 'sequence')::integer <> v_count + 1 then
    return jsonb_build_object('committed', false, 'reason', 'sequence_moved');
  end if;

  insert into public.research_early_access_tracking (order_number, sequence, record)
  values (v_order_number, (p_record ->> 'sequence')::integer, p_record);
  return jsonb_build_object('committed', true);
end;
$commit_tracking$;

create or replace function public.research_early_access_commit_fulfillment(
  p_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $commit_fulfillment$
declare
  v_order_number text;
begin
  v_order_number := p_record ->> 'orderId';

  perform 1 from public.research_early_access_placements
  where order_number = v_order_number
  for update;
  if not found or not exists (
    select 1 from public.research_early_access_settlements where order_number = v_order_number
  ) then
    return jsonb_build_object('committed', false, 'reason', 'not_settled');
  end if;

  if exists (
    select 1 from public.research_early_access_fulfillments where order_number = v_order_number
  ) then
    return jsonb_build_object('committed', false, 'reason', 'already_fulfilled');
  end if;

  insert into public.research_early_access_fulfillments (order_number, record)
  values (v_order_number, p_record);
  return jsonb_build_object('committed', true);
end;
$commit_fulfillment$;

-- ---------------------------------------------------------------------------
-- Functions: reads
-- ---------------------------------------------------------------------------

create or replace function public.research_early_access_placement_by_key(
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $placement_by_key$
  select record from public.research_early_access_placements
  where idempotency_key = p_idempotency_key;
$placement_by_key$;

create or replace function public.research_early_access_placement(
  p_order_number text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $placement$
  select record from public.research_early_access_placements
  where order_number = p_order_number;
$placement$;

create or replace function public.research_early_access_awaiting_review()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $awaiting_review$
  select coalesce(jsonb_agg(record order by placed_at, order_number), '[]'::jsonb)
  from public.research_early_access_placements
  where payment_state = 'under_review';
$awaiting_review$;

create or replace function public.research_early_access_proofs(
  p_order_number text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $proofs$
  select coalesce(jsonb_agg(record order by sequence), '[]'::jsonb)
  from public.research_early_access_payment_proofs
  where order_number = p_order_number;
$proofs$;

create or replace function public.research_early_access_settlement(
  p_order_number text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $settlement$
  select record from public.research_early_access_settlements
  where order_number = p_order_number;
$settlement$;

create or replace function public.research_early_access_verifications(
  p_order_number text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $verifications$
  select coalesce(jsonb_agg(record order by decided_at), '[]'::jsonb)
  from public.research_early_access_verifications
  where order_number = p_order_number;
$verifications$;

-- The dispatch view: events, tracking, and fulfillment composed, with null
-- when the order has never settled so the adapter can mirror the in-memory
-- default of an empty dispatch record.
create or replace function public.research_early_access_dispatch(
  p_order_number text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $dispatch$
  select case
    when not exists (
      select 1 from public.research_early_access_settlements
      where order_number = p_order_number
    ) then null
    else jsonb_build_object(
      'events', coalesce(
        (select jsonb_agg(record order by sequence)
         from public.research_early_access_dispatch_events
         where order_number = p_order_number),
        '[]'::jsonb
      ),
      'tracking', coalesce(
        (select jsonb_agg(record order by sequence)
         from public.research_early_access_tracking
         where order_number = p_order_number),
        '[]'::jsonb
      ),
      'fulfillment', (
        select record from public.research_early_access_fulfillments
        where order_number = p_order_number
      )
    )
  end;
$dispatch$;

-- ---------------------------------------------------------------------------
-- Functions: audit, releases, proof objects, admin exceptions
-- ---------------------------------------------------------------------------

create or replace function public.research_early_access_record_audit(
  p_event jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_audit$
begin
  insert into public.research_early_access_audit_events (event, order_number, actor, at, detail)
  values (
    p_event ->> 'event',
    p_event ->> 'orderNumber',
    p_event ->> 'actor',
    (p_event ->> 'at')::timestamptz,
    coalesce(p_event -> 'detail', '{}'::jsonb)
  );
end;
$record_audit$;

-- Append one founder release. 'appended' or 'duplicate'; never an overwrite.
create or replace function public.research_early_access_append_release(
  p_release jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $append_release$
begin
  insert into public.research_early_access_releases
    (release_id, product_id, variant_id, status, recorded_at, record)
  values (
    p_release ->> 'releaseId',
    p_release ->> 'productId',
    p_release ->> 'variantId',
    p_release ->> 'status',
    (p_release ->> 'recordedAt')::timestamptz,
    p_release
  );
  return 'appended';
exception
  when unique_violation then
    return 'duplicate';
end;
$append_release$;

create or replace function public.research_early_access_releases_for_unit(
  p_product_id text,
  p_variant_id text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $releases_for_unit$
  select coalesce(jsonb_agg(record order by recorded_at, release_id), '[]'::jsonb)
  from public.research_early_access_releases
  where product_id = p_product_id and variant_id = p_variant_id;
$releases_for_unit$;

create or replace function public.research_early_access_releases_all()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $releases_all$
  select coalesce(jsonb_agg(record order by recorded_at, release_id), '[]'::jsonb)
  from public.research_early_access_releases;
$releases_all$;

-- Reserve a private proof object. The adapter computes the opaque handle and
-- validates first; the constraints here re-validate, and the unique keys make
-- a repeated reservation answer null at the adapter, exactly like the port.
create or replace function public.research_early_access_reserve_proof_object(
  p_storage_ref text,
  p_bucket_id text,
  p_object_key text,
  p_content_type text,
  p_byte_size bigint,
  p_sha256 text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $reserve_proof_object$
begin
  insert into public.research_early_access_proof_objects
    (storage_ref, bucket_id, object_key, content_type, byte_size, sha256)
  values (p_storage_ref, p_bucket_id, p_object_key, p_content_type, p_byte_size, p_sha256);
  return p_storage_ref;
exception
  when unique_violation then
    return null;
  when check_violation then
    return null;
end;
$reserve_proof_object$;

create or replace function public.research_early_access_open_admin_exceptions()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $open_admin_exceptions$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id, 'kind', kind, 'orderNumber', order_number,
        'detail', detail, 'raisedAt', raised_at
      )
      order by raised_at, id
    ),
    '[]'::jsonb
  )
  from public.research_early_access_admin_exceptions
  where resolved_at is null;
$open_admin_exceptions$;

create or replace function public.research_early_access_resolve_admin_exception(
  p_id bigint,
  p_resolved_by text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $resolve_admin_exception$
declare
  v_updated integer;
begin
  if p_resolved_by is null or length(trim(p_resolved_by)) < 2 then
    return false;
  end if;
  update public.research_early_access_admin_exceptions
  set resolved_at = pg_catalog.clock_timestamp(),
      resolved_by = p_resolved_by
  where id = p_id and resolved_at is null;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$resolve_admin_exception$;

-- ---------------------------------------------------------------------------
-- Function privileges: service_role and nobody else
-- ---------------------------------------------------------------------------

do $function_grants$
declare
  v_role text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.research_early_access_commerce_block_mutation()',
    'public.research_early_access_commit_placement(jsonb,integer)',
    'public.research_early_access_commit_proof(jsonb)',
    'public.research_early_access_commit_settlement(jsonb)',
    'public.research_early_access_commit_dispatch_event(jsonb)',
    'public.research_early_access_commit_tracking(jsonb)',
    'public.research_early_access_commit_fulfillment(jsonb)',
    'public.research_early_access_placement_by_key(text)',
    'public.research_early_access_placement(text)',
    'public.research_early_access_awaiting_review()',
    'public.research_early_access_proofs(text)',
    'public.research_early_access_settlement(text)',
    'public.research_early_access_verifications(text)',
    'public.research_early_access_dispatch(text)',
    'public.research_early_access_record_audit(jsonb)',
    'public.research_early_access_append_release(jsonb)',
    'public.research_early_access_releases_for_unit(text,text)',
    'public.research_early_access_releases_all()',
    'public.research_early_access_reserve_proof_object(text,text,text,text,bigint,text)',
    'public.research_early_access_open_admin_exceptions()',
    'public.research_early_access_resolve_admin_exception(bigint,text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', v_signature);
    foreach v_role in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
        execute pg_catalog.format('revoke all on function %s from %I', v_signature, v_role);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
       and v_signature <> 'public.research_early_access_commerce_block_mutation()' then
      execute pg_catalog.format('grant execute on function %s to service_role', v_signature);
    end if;
  end loop;
end
$function_grants$;
