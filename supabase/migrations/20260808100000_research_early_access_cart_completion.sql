-- Xenios Research Early Access cart completion.
--
-- ADDITIVE / FAIL-CLOSED:
--   * preserves the single-product commerce path;
--   * adds truthful off-platform proof metadata;
--   * atomically settles one parent checkout, one receipt and every child release;
--   * adds durable reads required by the production cart store;
--   * grants no browser table access and no browser routine execution.
--
-- Requires 20260807193000_research_early_access_cart_checkout.sql.
-- Does NOT depend on the intentionally-unapplied unit-hold RPC migration.

create extension if not exists pgcrypto;

create table if not exists public.research_early_access_cart_external_proofs (
  id uuid primary key default gen_random_uuid(),
  cart_checkout_id uuid not null references public.research_early_access_cart_checkouts(id) on delete restrict,
  evidence_ref text not null unique check (evidence_ref ~ '^eaext\.[A-Za-z0-9_-]{16,120}$'),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  filename text not null check (length(filename) between 1 and 240),
  content_type text not null check (length(content_type) between 2 and 127),
  byte_size bigint not null check (byte_size between 1 and 25000000),
  provenance_note text not null check (length(btrim(provenance_note)) between 8 and 1000),
  recorded_by text not null check (length(btrim(recorded_by)) between 2 and 200),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists research_ea_cart_external_proofs_checkout_idx
  on public.research_early_access_cart_external_proofs(cart_checkout_id, recorded_at desc);

create table if not exists public.research_early_access_cart_receipts (
  id uuid primary key default gen_random_uuid(),
  cart_checkout_id uuid not null unique references public.research_early_access_cart_checkouts(id) on delete restrict,
  receipt_id text not null unique check (length(receipt_id) between 8 and 200),
  invoice_number text not null,
  payment_reference text not null,
  verified_amount_cents bigint not null check (verified_amount_cents > 0),
  currency text not null check (currency = 'USD'),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  issued_at timestamptz not null
);

create table if not exists public.research_early_access_cart_child_releases (
  id uuid primary key default gen_random_uuid(),
  cart_checkout_id uuid not null references public.research_early_access_cart_checkouts(id) on delete restrict,
  cart_item_id uuid not null unique references public.research_early_access_cart_items(id) on delete restrict,
  release_id text not null unique check (length(release_id) between 8 and 240),
  order_number text not null unique,
  supplier_id text not null,
  supplier_sku text not null,
  quantity integer not null check (quantity between 1 and 3),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  released_at timestamptz not null
);

create index if not exists research_ea_cart_child_releases_supplier_idx
  on public.research_early_access_cart_child_releases(supplier_id, released_at desc);

create table if not exists public.research_early_access_cart_supplier_outbox (
  id uuid primary key default gen_random_uuid(),
  cart_checkout_id uuid not null references public.research_early_access_cart_checkouts(id) on delete restrict,
  supplier_id text not null,
  outbox_key text not null unique,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  state text not null default 'pending' check (state in ('pending','acknowledged','packing','shipped','cancelled')),
  created_at timestamptz not null,
  acknowledged_at timestamptz,
  shipped_at timestamptz,
  unique (cart_checkout_id, supplier_id)
);

-- The evidence tables and outbox are append-only at this release boundary.
create or replace function public.research_early_access_cart_completion_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'early access cart completion evidence is immutable' using errcode = '55000';
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'research_early_access_cart_external_proofs',
    'research_early_access_cart_receipts',
    'research_early_access_cart_child_releases'
  ] loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_immutable', v_table);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.research_early_access_cart_completion_immutable()',
      v_table || '_immutable',
      v_table
    );
  end loop;
end $$;

-- Private quote read, including an expired quote. The service decides
-- QUOTE_EXPIRED rather than collapsing it into QUOTE_NOT_FOUND.
create or replace function public.research_early_access_cart_quote_record(p_quote_id text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select record
    from public.research_early_access_cart_quotes
   where quote_id = p_quote_id
$$;

-- Idempotency lookup uses the same domain-separated hash as commit.
create or replace function public.research_early_access_cart_checkout_for_key(p_idempotency_key text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select record
    from public.research_early_access_cart_checkouts
   where idempotency_key_hash = encode(
     extensions.digest(
       convert_to('xenios:ea-cart-idempotency:v1|' || p_idempotency_key, 'utf8'),
       'sha256'
     ),
     'hex'
   )
$$;

-- Return stable refusal reasons instead of leaking a driver/constraint error.
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
  then
    raise exception 'invalid early access cart checkout' using errcode = '22023';
  end if;

  v_key_hash := encode(
    extensions.digest(
      convert_to('xenios:ea-cart-idempotency:v1|' || p_idempotency_key, 'utf8'),
      'sha256'
    ),
    'hex'
  );

  select * into v_existing
    from public.research_early_access_cart_checkouts
   where idempotency_key_hash = v_key_hash;
  if found then
    if v_existing.intent_hash <> p_checkout->>'intentHash' then
      return jsonb_build_object(
        'committed', false,
        'replayed', false,
        'reason', 'idempotency_key_taken',
        'record', v_existing.record
      );
    end if;
    return jsonb_build_object(
      'committed', false,
      'replayed', true,
      'reason', 'idempotency_key_taken',
      'record', v_existing.record
    );
  end if;

  if exists (
    select 1 from public.research_early_access_cart_checkouts
     where checkout_number = p_checkout->>'cartCheckoutNumber'
  ) then
    return jsonb_build_object(
      'committed', false,
      'replayed', false,
      'reason', 'checkout_number_taken',
      'record', null
    );
  end if;

  select count(*),
         coalesce(sum((item->>'subtotalCents')::bigint), 0),
         coalesce(sum((item->>'discountCents')::bigint), 0),
         coalesce(sum((item->>'payableCents')::bigint), 0)
    into v_line_count, v_sum_subtotal, v_sum_discount, v_sum_payable
    from jsonb_array_elements(p_items) item;

  if v_line_count <> jsonb_array_length(p_items)
     or v_sum_subtotal <> (p_checkout->'invoice'->>'subtotalCents')::bigint
     or v_sum_discount <> (p_checkout->'invoice'->>'discountCents')::bigint
     or v_sum_payable <> v_sum_subtotal - v_sum_discount
     or (p_checkout->'invoice'->>'payableTotalCents')::bigint
          <> v_sum_payable
             + (p_checkout->'invoice'->>'shippingCents')::bigint
             + (p_checkout->'invoice'->>'taxCents')::bigint
  then
    raise exception 'cart totals disagree' using errcode = '23514';
  end if;

  insert into public.research_early_access_cart_checkouts(
    checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id,
    payment_state, currency, subtotal_cents, discount_cents, shipping_cents,
    tax_cents, payable_total_cents, record, placed_at
  ) values (
    p_checkout->>'cartCheckoutNumber',
    p_checkout->>'customerRef',
    v_key_hash,
    p_checkout->>'intentHash',
    p_checkout->>'quoteId',
    'awaiting_payment',
    'USD',
    (p_checkout->'invoice'->>'subtotalCents')::bigint,
    (p_checkout->'invoice'->>'discountCents')::bigint,
    (p_checkout->'invoice'->>'shippingCents')::bigint,
    (p_checkout->'invoice'->>'taxCents')::bigint,
    (p_checkout->'invoice'->>'payableTotalCents')::bigint,
    p_checkout,
    p_at
  ) returning * into v_checkout;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if exists (
      select 1 from public.research_early_access_cart_items
       where order_number = v_item->>'orderNumber'
    ) then
      raise exception 'child order number taken' using errcode = '23505';
    end if;
    insert into public.research_early_access_cart_items(
      cart_checkout_id, line_index, order_number, product_id, variant_id, sku,
      quantity, supplier_id, supplier_sku, unit_price_cents, subtotal_cents,
      discount_cents, payable_cents, record
    ) values (
      v_checkout.id,
      (v_item->>'lineIndex')::integer,
      v_item->>'orderNumber',
      v_item->>'productId',
      v_item->>'variantId',
      v_item->>'sku',
      (v_item->>'quantity')::integer,
      v_item->>'supplierId',
      v_item->>'supplierSku',
      (v_item->>'unitPriceCents')::bigint,
      (v_item->>'subtotalCents')::bigint,
      (v_item->>'discountCents')::bigint,
      (v_item->>'payableCents')::bigint,
      v_item
    );
  end loop;

  insert into public.research_early_access_cart_invoices(
    cart_checkout_id, invoice_number, payment_reference, currency,
    subtotal_cents, discount_cents, shipping_cents, tax_cents,
    payable_total_cents, record, issued_at
  ) values (
    v_checkout.id,
    p_invoice->>'invoiceNumber',
    p_invoice->>'paymentReference',
    'USD',
    (p_invoice->>'subtotalCents')::bigint,
    (p_invoice->>'discountCents')::bigint,
    (p_invoice->>'shippingCents')::bigint,
    (p_invoice->>'taxCents')::bigint,
    (p_invoice->>'payableTotalCents')::bigint,
    p_invoice,
    p_at
  );

  insert into public.research_early_access_cart_events(
    cart_checkout_id, checkout_number, event_type, actor_scope_hash, metadata, occurred_at
  ) values (
    v_checkout.id,
    v_checkout.checkout_number,
    'checkout_created',
    encode(
      extensions.digest(
        convert_to('xenios:ea-cart-actor:v1|' || v_checkout.customer_ref, 'utf8'),
        'sha256'
      ),
      'hex'
    ),
    jsonb_build_object(
      'lineCount', v_line_count,
      'payableTotalCents', v_checkout.payable_total_cents
    ),
    p_at
  );

  return jsonb_build_object(
    'committed', true,
    'replayed', false,
    'record', v_checkout.record
  );
exception
  when unique_violation then
    -- A child order number collision is a server-generator fault. No partial
    -- rows survive because the function is one transaction.
    raise;
end;
$$;

create or replace function public.research_early_access_record_cart_external_proof(p_proof jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_checkout public.research_early_access_cart_checkouts%rowtype;
  v_existing public.research_early_access_cart_external_proofs%rowtype;
begin
  if p_proof is null or jsonb_typeof(p_proof) <> 'object' then
    raise exception 'invalid cart external proof' using errcode = '22023';
  end if;

  select * into v_checkout
    from public.research_early_access_cart_checkouts
   where checkout_number = p_proof->>'cartCheckoutNumber'
   for update;
  if not found then
    return jsonb_build_object('committed', false, 'reason', 'checkout_unknown', 'proof', null);
  end if;

  select * into v_existing
    from public.research_early_access_cart_external_proofs
   where evidence_ref = p_proof->>'evidenceRef';
  if found then
    return jsonb_build_object(
      'committed', false,
      'reason', 'evidence_ref_taken',
      'proof', v_existing.record
    );
  end if;

  insert into public.research_early_access_cart_external_proofs(
    cart_checkout_id, evidence_ref, sha256, filename, content_type, byte_size,
    provenance_note, recorded_by, record, recorded_at
  ) values (
    v_checkout.id,
    p_proof->>'evidenceRef',
    p_proof->>'sha256',
    p_proof->>'filename',
    p_proof->>'contentType',
    (p_proof->>'byteSize')::bigint,
    p_proof->>'provenanceNote',
    p_proof->>'recordedBy',
    p_proof,
    (p_proof->>'recordedAt')::timestamptz
  );

  update public.research_early_access_cart_checkouts
     set payment_state = case
           when payment_state = 'awaiting_payment' then 'under_review'
           else payment_state
         end,
         record = case
           when payment_state = 'awaiting_payment'
             then jsonb_set(record, '{paymentState}', '"under_review"'::jsonb, true)
           else record
         end
   where id = v_checkout.id;

  insert into public.research_early_access_cart_events(
    cart_checkout_id, checkout_number, event_type, actor_scope_hash, metadata, occurred_at
  ) values (
    v_checkout.id,
    v_checkout.checkout_number,
    'proof_recorded',
    encode(
      extensions.digest(
        convert_to('xenios:ea-cart-admin:v1|' || (p_proof->>'recordedBy'), 'utf8'),
        'sha256'
      ),
      'hex'
    ),
    jsonb_build_object(
      'evidenceRef', p_proof->>'evidenceRef',
      'storedOnPlatform', false
    ),
    (p_proof->>'recordedAt')::timestamptz
  );

  return jsonb_build_object('committed', true, 'proof', p_proof);
end;
$$;

create or replace function public.research_early_access_cart_external_proofs(p_checkout_number text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(p.record order by p.recorded_at), '[]'::jsonb)
    from public.research_early_access_cart_external_proofs p
    join public.research_early_access_cart_checkouts c on c.id = p.cart_checkout_id
   where c.checkout_number = p_checkout_number
$$;

create or replace function public.research_early_access_cart_settlement(p_checkout_number text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select s.record
    from public.research_early_access_cart_settlements s
    join public.research_early_access_cart_checkouts c on c.id = s.cart_checkout_id
   where c.checkout_number = p_checkout_number
$$;

create or replace function public.research_early_access_commit_cart_settlement(
  p_checkout_number text,
  p_external_transaction_id text,
  p_evidence_ref text,
  p_verified_amount_cents bigint,
  p_verified_currency text,
  p_actor_id text,
  p_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_checkout public.research_early_access_cart_checkouts%rowtype;
  v_invoice public.research_early_access_cart_invoices%rowtype;
  v_existing public.research_early_access_cart_settlements%rowtype;
  v_item public.research_early_access_cart_items%rowtype;
  v_receipt jsonb;
  v_release jsonb;
  v_releases jsonb := '[]'::jsonb;
  v_settlement jsonb;
  v_supplier record;
begin
  select * into v_checkout
    from public.research_early_access_cart_checkouts
   where checkout_number = p_checkout_number
   for update;
  if not found then
    return jsonb_build_object('committed', false, 'reason', 'checkout_unknown', 'settlement', null);
  end if;

  select * into v_existing
    from public.research_early_access_cart_settlements
   where cart_checkout_id = v_checkout.id;
  if found then
    return jsonb_build_object(
      'committed', false,
      'reason', 'already_settled',
      'settlement', v_existing.record
    );
  end if;

  if exists (
    select 1 from public.research_early_access_cart_settlements
     where external_transaction_id = p_external_transaction_id
  ) then
    return jsonb_build_object('committed', false, 'reason', 'transaction_id_used', 'settlement', null);
  end if;

  if not exists (
    select 1
      from public.research_early_access_cart_external_proofs p
     where p.cart_checkout_id = v_checkout.id
       and p.evidence_ref = p_evidence_ref
  ) then
    return jsonb_build_object('committed', false, 'reason', 'evidence_missing', 'settlement', null);
  end if;

  if p_verified_currency <> v_checkout.currency
     or p_verified_amount_cents <> v_checkout.payable_total_cents
  then
    return jsonb_build_object('committed', false, 'reason', 'amount_mismatch', 'settlement', null);
  end if;

  select * into v_invoice
    from public.research_early_access_cart_invoices
   where cart_checkout_id = v_checkout.id;
  if not found then
    raise exception 'cart invoice missing' using errcode = '23514';
  end if;

  v_receipt := jsonb_build_object(
    'receiptId', 'xea-cart-receipt:' || v_checkout.checkout_number,
    'cartCheckoutNumber', v_checkout.checkout_number,
    'invoiceNumber', v_invoice.invoice_number,
    'paymentReference', v_invoice.payment_reference,
    'verifiedAmountCents', p_verified_amount_cents,
    'currency', p_verified_currency,
    'issuedAt', p_at
  );

  insert into public.research_early_access_cart_receipts(
    cart_checkout_id, receipt_id, invoice_number, payment_reference,
    verified_amount_cents, currency, record, issued_at
  ) values (
    v_checkout.id,
    v_receipt->>'receiptId',
    v_invoice.invoice_number,
    v_invoice.payment_reference,
    p_verified_amount_cents,
    p_verified_currency,
    v_receipt,
    p_at
  );

  for v_item in
    select * from public.research_early_access_cart_items
     where cart_checkout_id = v_checkout.id
     order by line_index
  loop
    v_release := jsonb_build_object(
      'releaseId', 'xea-cart-release:' || v_item.order_number,
      'cartCheckoutNumber', v_checkout.checkout_number,
      'orderNumber', v_item.order_number,
      'supplierId', v_item.supplier_id,
      'supplierSku', v_item.supplier_sku,
      'quantity', v_item.quantity,
      'releasedAt', p_at,
      'shippedAt', null,
      'tracking', jsonb_build_array()
    );
    insert into public.research_early_access_cart_child_releases(
      cart_checkout_id, cart_item_id, release_id, order_number, supplier_id,
      supplier_sku, quantity, record, released_at
    ) values (
      v_checkout.id,
      v_item.id,
      v_release->>'releaseId',
      v_item.order_number,
      v_item.supplier_id,
      v_item.supplier_sku,
      v_item.quantity,
      v_release,
      p_at
    );
    v_releases := v_releases || jsonb_build_array(v_release);
  end loop;

  for v_supplier in
    select supplier_id,
           jsonb_agg(record order by line_index) as items
      from public.research_early_access_cart_items
     where cart_checkout_id = v_checkout.id
     group by supplier_id
  loop
    insert into public.research_early_access_cart_supplier_outbox(
      cart_checkout_id, supplier_id, outbox_key, payload, state, created_at
    ) values (
      v_checkout.id,
      v_supplier.supplier_id,
      'xea-cart-supplier:' || v_checkout.checkout_number || ':' || v_supplier.supplier_id,
      jsonb_build_object(
        'cartCheckoutNumber', v_checkout.checkout_number,
        'supplierId', v_supplier.supplier_id,
        'shipTo', v_checkout.record->'shipTo',
        'contact', v_checkout.record->'contact',
        'items', v_supplier.items
      ),
      'pending',
      p_at
    );
  end loop;

  v_settlement := jsonb_build_object(
    'cartCheckoutNumber', v_checkout.checkout_number,
    'externalTransactionId', p_external_transaction_id,
    'reviewedEvidenceRef', p_evidence_ref,
    'verifiedAmountCents', p_verified_amount_cents,
    'verifiedCurrency', p_verified_currency,
    'settledAt', p_at,
    'settledBy', p_actor_id,
    'receipt', v_receipt,
    'childReleases', v_releases
  );

  insert into public.research_early_access_cart_settlements(
    cart_checkout_id, external_transaction_id, reviewed_evidence_ref,
    verified_amount_cents, verified_currency, actor_id, record, settled_at
  ) values (
    v_checkout.id,
    p_external_transaction_id,
    p_evidence_ref,
    p_verified_amount_cents,
    p_verified_currency,
    p_actor_id,
    v_settlement,
    p_at
  );

  update public.research_early_access_cart_checkouts
     set payment_state = 'payment_verified',
         record = jsonb_set(record, '{paymentState}', '"payment_verified"'::jsonb, true)
   where id = v_checkout.id;

  insert into public.research_early_access_cart_events(
    cart_checkout_id, checkout_number, event_type, actor_scope_hash, metadata, occurred_at
  ) values (
    v_checkout.id,
    v_checkout.checkout_number,
    'payment_verified',
    encode(
      extensions.digest(
        convert_to('xenios:ea-cart-admin:v1|' || p_actor_id, 'utf8'),
        'sha256'
      ),
      'hex'
    ),
    jsonb_build_object(
      'verifiedAmountCents', p_verified_amount_cents,
      'childReleaseCount', jsonb_array_length(v_releases)
    ),
    p_at
  );

  return jsonb_build_object('committed', true, 'settlement', v_settlement);
exception
  when unique_violation then
    select * into v_existing
      from public.research_early_access_cart_settlements
     where cart_checkout_id = v_checkout.id;
    if found then
      return jsonb_build_object(
        'committed', false,
        'reason', 'already_settled',
        'settlement', v_existing.record
      );
    end if;
    if exists (
      select 1 from public.research_early_access_cart_settlements
       where external_transaction_id = p_external_transaction_id
    ) then
      return jsonb_build_object('committed', false, 'reason', 'transaction_id_used', 'settlement', null);
    end if;
    raise;
end;
$$;

create or replace function public.research_early_access_cart_status(p_checkout_number text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'checkout', c.record,
    'payment', jsonb_build_object(
      'state', c.payment_state,
      'paid', s.id is not null,
      'externalProofCount', (
        select count(*)
          from public.research_early_access_cart_external_proofs p
         where p.cart_checkout_id = c.id
      )
    ),
    'receipt', r.record,
    'fulfilment', jsonb_build_object(
      'released', s.id is not null,
      'childOrders', coalesce((
        select jsonb_agg(cr.record order by cr.order_number)
          from public.research_early_access_cart_child_releases cr
         where cr.cart_checkout_id = c.id
      ), '[]'::jsonb)
    )
  )
    from public.research_early_access_cart_checkouts c
    left join public.research_early_access_cart_settlements s on s.cart_checkout_id = c.id
    left join public.research_early_access_cart_receipts r on r.cart_checkout_id = c.id
   where c.checkout_number = p_checkout_number
$$;

-- Forced RLS and exact server-only boundary.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'research_early_access_cart_external_proofs',
    'research_early_access_cart_receipts',
    'research_early_access_cart_child_releases',
    'research_early_access_cart_supplier_outbox'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('revoke all on public.%I from public, anon, authenticated', v_table);
  end loop;
end $$;

revoke all on function public.research_early_access_cart_quote_record(text) from public, anon, authenticated;
revoke all on function public.research_early_access_cart_checkout_for_key(text) from public, anon, authenticated;
revoke all on function public.research_early_access_commit_cart_checkout(jsonb,jsonb,jsonb,text,timestamptz) from public, anon, authenticated;
revoke all on function public.research_early_access_record_cart_external_proof(jsonb) from public, anon, authenticated;
revoke all on function public.research_early_access_cart_external_proofs(text) from public, anon, authenticated;
revoke all on function public.research_early_access_cart_settlement(text) from public, anon, authenticated;
revoke all on function public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.research_early_access_cart_status(text) from public, anon, authenticated;

grant execute on function public.research_early_access_cart_quote_record(text) to service_role;
grant execute on function public.research_early_access_cart_checkout_for_key(text) to service_role;
grant execute on function public.research_early_access_commit_cart_checkout(jsonb,jsonb,jsonb,text,timestamptz) to service_role;
grant execute on function public.research_early_access_record_cart_external_proof(jsonb) to service_role;
grant execute on function public.research_early_access_cart_external_proofs(text) to service_role;
grant execute on function public.research_early_access_cart_settlement(text) to service_role;
grant execute on function public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,timestamptz) to service_role;
grant execute on function public.research_early_access_cart_status(text) to service_role;

comment on function public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,timestamptz) is
  'Named-admin, exactly-once cart settlement: one receipt, every child supplier release, supplier-grouped outbox, and no partial state.';
