-- Xenios Research Early Access parent cart checkout and atomic child-order foundation.
-- ADDITIVE ONLY. Creates no rows, releases no supplier order, and enables no feature.
-- Service-role/server boundary only; browser roles receive zero table privileges.

create extension if not exists pgcrypto;

create table if not exists public.research_early_access_cart_quotes (
  quote_id text primary key check (quote_id ~ '^xeaq_[A-Za-z0-9_-]{16,120}$'),
  customer_ref text not null check (customer_ref ~ '^eac_[a-f0-9]{32}$'),
  intent_hash text not null check (intent_hash ~ '^[a-f0-9]{64}$'),
  quote_hash text not null check (quote_hash ~ '^[a-f0-9]{64}$'),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  quoted_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > quoted_at),
  created_at timestamptz not null default now()
);

create table if not exists public.research_early_access_cart_checkouts (
  id uuid primary key default gen_random_uuid(),
  checkout_number text not null unique check (checkout_number ~ '^XEC-[A-Z0-9]{16,40}$'),
  customer_ref text not null check (customer_ref ~ '^eac_[a-f0-9]{32}$'),
  idempotency_key_hash text not null unique check (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  intent_hash text not null check (intent_hash ~ '^[a-f0-9]{64}$'),
  quote_id text not null references public.research_early_access_cart_quotes(quote_id),
  payment_state text not null check (payment_state in ('awaiting_payment','under_review','payment_verified','payment_rejected')),
  currency text not null check (currency = 'USD'),
  subtotal_cents bigint not null check (subtotal_cents > 0),
  discount_cents bigint not null check (discount_cents >= 0 and discount_cents < subtotal_cents),
  shipping_cents bigint not null check (shipping_cents >= 0),
  tax_cents bigint not null check (tax_cents >= 0),
  payable_total_cents bigint not null check (
    payable_total_cents = subtotal_cents - discount_cents + shipping_cents + tax_cents
    and payable_total_cents > 0
  ),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  placed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists research_ea_cart_checkout_customer_idx
  on public.research_early_access_cart_checkouts(customer_ref, placed_at desc);

create table if not exists public.research_early_access_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_checkout_id uuid not null references public.research_early_access_cart_checkouts(id) on delete restrict,
  line_index integer not null check (line_index between 0 and 99),
  order_number text not null unique check (order_number ~ '^XEA-CART-[A-Z0-9-]{8,80}$'),
  product_id text not null check (length(product_id) between 2 and 200),
  variant_id text not null check (length(variant_id) between 2 and 200),
  sku text not null check (length(sku) between 2 and 200),
  quantity integer not null check (quantity between 1 and 3),
  supplier_id text not null check (length(supplier_id) between 2 and 200),
  supplier_sku text not null check (length(supplier_sku) between 2 and 200),
  unit_price_cents bigint not null check (unit_price_cents > 0),
  subtotal_cents bigint not null check (subtotal_cents = unit_price_cents * quantity),
  discount_cents bigint not null check (discount_cents >= 0 and discount_cents < subtotal_cents),
  payable_cents bigint not null check (payable_cents = subtotal_cents - discount_cents and payable_cents > 0),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  unique (cart_checkout_id, line_index),
  unique (cart_checkout_id, product_id, variant_id)
);

create index if not exists research_ea_cart_items_supplier_idx
  on public.research_early_access_cart_items(supplier_id, cart_checkout_id);

create table if not exists public.research_early_access_cart_invoices (
  id uuid primary key default gen_random_uuid(),
  cart_checkout_id uuid not null unique references public.research_early_access_cart_checkouts(id) on delete restrict,
  invoice_number text not null unique check (invoice_number ~ '^XEI-[A-Z0-9]{16,40}$'),
  payment_reference text not null unique check (payment_reference ~ '^XEACART-[A-Z0-9]{16,40}$'),
  currency text not null check (currency = 'USD'),
  subtotal_cents bigint not null check (subtotal_cents > 0),
  discount_cents bigint not null check (discount_cents >= 0),
  shipping_cents bigint not null check (shipping_cents >= 0),
  tax_cents bigint not null check (tax_cents >= 0),
  payable_total_cents bigint not null check (
    payable_total_cents = subtotal_cents - discount_cents + shipping_cents + tax_cents
    and payable_total_cents > 0
  ),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  issued_at timestamptz not null
);

create table if not exists public.research_early_access_cart_settlements (
  id uuid primary key default gen_random_uuid(),
  cart_checkout_id uuid not null unique references public.research_early_access_cart_checkouts(id) on delete restrict,
  external_transaction_id text not null unique check (length(btrim(external_transaction_id)) between 3 and 200),
  reviewed_evidence_ref text not null check (length(btrim(reviewed_evidence_ref)) between 3 and 200),
  verified_amount_cents bigint not null check (verified_amount_cents > 0),
  verified_currency text not null check (verified_currency = 'USD'),
  actor_id text not null check (length(btrim(actor_id)) between 2 and 200),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  settled_at timestamptz not null
);

create table if not exists public.research_early_access_cart_events (
  id uuid primary key default gen_random_uuid(),
  cart_checkout_id uuid,
  checkout_number text,
  event_type text not null check (event_type in (
    'quote_created','checkout_created','proof_recorded','payment_verified',
    'child_release_created','shipment_updated','payment_rejected'
  )),
  actor_scope_hash text not null check (actor_scope_hash ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null
);

-- Audit and settlement evidence are append-only.
create or replace function public.research_early_access_cart_immutable()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  raise exception 'early access cart evidence is immutable' using errcode = '55000';
end;
$$;

do $$ declare v_table text; begin
  foreach v_table in array array[
    'research_early_access_cart_items',
    'research_early_access_cart_invoices',
    'research_early_access_cart_settlements',
    'research_early_access_cart_events'
  ] loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_immutable', v_table);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.research_early_access_cart_immutable()', v_table || '_immutable', v_table);
  end loop;
end $$;


-- Private quote persistence. Contact and shipping live in record jsonb and never
-- need to be echoed into browser history or a confirm body.
create or replace function public.research_early_access_put_cart_quote(
  p_quote_id text,
  p_customer_ref text,
  p_intent_hash text,
  p_quote_hash text,
  p_record jsonb,
  p_quoted_at timestamptz,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_existing public.research_early_access_cart_quotes%rowtype;
begin
  if p_record is null or jsonb_typeof(p_record)<>'object' then
    raise exception 'invalid cart quote' using errcode='22023';
  end if;
  select * into v_existing from public.research_early_access_cart_quotes where quote_id=p_quote_id;
  if found then
    if v_existing.customer_ref<>p_customer_ref or v_existing.intent_hash<>p_intent_hash or v_existing.quote_hash<>p_quote_hash then
      raise exception 'cart quote conflict' using errcode='23505';
    end if;
    return jsonb_build_object('stored',false,'replayed',true,'record',v_existing.record);
  end if;
  insert into public.research_early_access_cart_quotes(
    quote_id,customer_ref,intent_hash,quote_hash,record,quoted_at,expires_at
  ) values (p_quote_id,p_customer_ref,p_intent_hash,p_quote_hash,p_record,p_quoted_at,p_expires_at);
  return jsonb_build_object('stored',true,'replayed',false,'record',p_record);
end $$;

create or replace function public.research_early_access_cart_quote_for_id(p_quote_id text)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog
as $$
  select record from public.research_early_access_cart_quotes
   where quote_id=p_quote_id and expires_at>clock_timestamp()
$$;

create or replace function public.research_early_access_cart_checkout_for_number(p_checkout_number text)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog
as $$
  select record from public.research_early_access_cart_checkouts
   where checkout_number=p_checkout_number
$$;

revoke all on function public.research_early_access_put_cart_quote(text,text,text,text,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.research_early_access_cart_quote_for_id(text) from public,anon,authenticated;
revoke all on function public.research_early_access_cart_checkout_for_number(text) from public,anon,authenticated;
grant execute on function public.research_early_access_put_cart_quote(text,text,text,text,jsonb,timestamptz,timestamptz) to service_role;
grant execute on function public.research_early_access_cart_quote_for_id(text) to service_role;
grant execute on function public.research_early_access_cart_checkout_for_number(text) to service_role;

-- Atomic parent checkout + all child lines + invoice. Any invalid line aborts the whole call.
create or replace function public.research_early_access_commit_cart_checkout(
  p_checkout jsonb,
  p_items jsonb,
  p_invoice jsonb,
  p_idempotency_key text,
  p_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_checkout public.research_early_access_cart_checkouts%rowtype;
  v_existing public.research_early_access_cart_checkouts%rowtype;
  v_key_hash text;
  v_item jsonb;
  v_line_count integer;
  v_sum_subtotal bigint;
  v_sum_discount bigint;
  v_sum_payable bigint;
begin
  if p_checkout is null or jsonb_typeof(p_checkout) <> 'object'
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 25
     or p_invoice is null or jsonb_typeof(p_invoice) <> 'object'
     or p_idempotency_key !~ '^xeac_[A-Za-z0-9_-]{16,120}$'
  then raise exception 'invalid early access cart checkout' using errcode='22023'; end if;

  v_key_hash := encode(public.digest(convert_to('xenios:ea-cart-idempotency:v1|' || p_idempotency_key,'utf8'),'sha256'),'hex');
  select * into v_existing from public.research_early_access_cart_checkouts where idempotency_key_hash = v_key_hash;
  if found then
    if v_existing.intent_hash <> p_checkout->>'intentHash' then
      raise exception 'cart idempotency conflict' using errcode='23505';
    end if;
    return jsonb_build_object('committed',false,'replayed',true,'checkoutNumber',v_existing.checkout_number,'record',v_existing.record);
  end if;

  select count(*), coalesce(sum((item->>'subtotalCents')::bigint),0),
         coalesce(sum((item->>'discountCents')::bigint),0),
         coalesce(sum((item->>'payableCents')::bigint),0)
    into v_line_count, v_sum_subtotal, v_sum_discount, v_sum_payable
    from jsonb_array_elements(p_items) item;

  if v_line_count <> jsonb_array_length(p_items)
     or v_sum_subtotal <> (p_checkout->>'subtotalCents')::bigint
     or v_sum_discount <> (p_checkout->>'discountCents')::bigint
     or v_sum_payable <> v_sum_subtotal - v_sum_discount
     or (p_checkout->>'payableTotalCents')::bigint < v_sum_payable
  then raise exception 'cart totals disagree' using errcode='23514'; end if;

  insert into public.research_early_access_cart_checkouts(
    checkout_number,customer_ref,idempotency_key_hash,intent_hash,quote_id,payment_state,
    currency,subtotal_cents,discount_cents,shipping_cents,tax_cents,payable_total_cents,
    record,placed_at
  ) values (
    p_checkout->>'cartCheckoutNumber',p_checkout->>'customerRef',v_key_hash,
    p_checkout->>'intentHash',p_checkout->>'quoteId','awaiting_payment','USD',
    (p_checkout->>'subtotalCents')::bigint,(p_checkout->>'discountCents')::bigint,
    (p_checkout->>'shippingCents')::bigint,(p_checkout->>'taxCents')::bigint,
    (p_checkout->>'payableTotalCents')::bigint,p_checkout,p_at
  ) returning * into v_checkout;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.research_early_access_cart_items(
      cart_checkout_id,line_index,order_number,product_id,variant_id,sku,quantity,
      supplier_id,supplier_sku,unit_price_cents,subtotal_cents,discount_cents,payable_cents,record
    ) values (
      v_checkout.id,(v_item->>'lineIndex')::integer,v_item->>'orderNumber',
      v_item->>'productId',v_item->>'variantId',v_item->>'sku',(v_item->>'quantity')::integer,
      v_item->>'supplierId',v_item->>'supplierSku',(v_item->>'unitPriceCents')::bigint,
      (v_item->>'subtotalCents')::bigint,(v_item->>'discountCents')::bigint,
      (v_item->>'payableCents')::bigint,v_item
    );
  end loop;

  insert into public.research_early_access_cart_invoices(
    cart_checkout_id,invoice_number,payment_reference,currency,subtotal_cents,
    discount_cents,shipping_cents,tax_cents,payable_total_cents,record,issued_at
  ) values (
    v_checkout.id,p_invoice->>'invoiceNumber',p_invoice->>'paymentReference','USD',
    (p_invoice->>'subtotalCents')::bigint,(p_invoice->>'discountCents')::bigint,
    (p_invoice->>'shippingCents')::bigint,(p_invoice->>'taxCents')::bigint,
    (p_invoice->>'payableTotalCents')::bigint,p_invoice,p_at
  );

  insert into public.research_early_access_cart_events(
    cart_checkout_id,checkout_number,event_type,actor_scope_hash,metadata,occurred_at
  ) values (
    v_checkout.id,v_checkout.checkout_number,'checkout_created',
    encode(public.digest(convert_to('xenios:ea-cart-actor:v1|'||v_checkout.customer_ref,'utf8'),'sha256'),'hex'),
    jsonb_build_object('lineCount',v_line_count,'payableTotalCents',v_checkout.payable_total_cents),p_at
  );

  return jsonb_build_object('committed',true,'replayed',false,'checkoutNumber',v_checkout.checkout_number,'record',v_checkout.record);
end;
$$;

-- Exact service-role boundary. No browser table grants or routine execution.
alter table public.research_early_access_cart_quotes enable row level security;
alter table public.research_early_access_cart_quotes force row level security;
alter table public.research_early_access_cart_checkouts enable row level security;
alter table public.research_early_access_cart_checkouts force row level security;
alter table public.research_early_access_cart_items enable row level security;
alter table public.research_early_access_cart_items force row level security;
alter table public.research_early_access_cart_invoices enable row level security;
alter table public.research_early_access_cart_invoices force row level security;
alter table public.research_early_access_cart_settlements enable row level security;
alter table public.research_early_access_cart_settlements force row level security;
alter table public.research_early_access_cart_events enable row level security;
alter table public.research_early_access_cart_events force row level security;

revoke all on public.research_early_access_cart_quotes from public, anon, authenticated;
revoke all on public.research_early_access_cart_checkouts from public, anon, authenticated;
revoke all on public.research_early_access_cart_items from public, anon, authenticated;
revoke all on public.research_early_access_cart_invoices from public, anon, authenticated;
revoke all on public.research_early_access_cart_settlements from public, anon, authenticated;
revoke all on public.research_early_access_cart_events from public, anon, authenticated;
revoke all on function public.research_early_access_commit_cart_checkout(jsonb,jsonb,jsonb,text,timestamptz) from public, anon, authenticated;
grant execute on function public.research_early_access_commit_cart_checkout(jsonb,jsonb,jsonb,text,timestamptz) to service_role;

comment on table public.research_early_access_cart_checkouts is
  'Parent Early Access cart checkout. One payment experience, atomic child lines, service-role only.';
comment on function public.research_early_access_commit_cart_checkout(jsonb,jsonb,jsonb,text,timestamptz) is
  'Atomically commits one parent cart checkout, every child line, and its invoice; creates no supplier release.';
