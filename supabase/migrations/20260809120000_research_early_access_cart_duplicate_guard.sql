-- ONE ACTIVE CHECKOUT PER QUOTE, ENFORCED BY POSTGRES.
--
-- WHAT WENT WRONG, IN ONE PARAGRAPH.
--
-- The first real founder checkout created TWO parent orders sixty seconds
-- apart: XEC-063A962A0053A65324F21E7F at 00:44:48Z and
-- XEC-E1703CC63BBE89E6839E24C1 at 00:45:48Z. Same customer, same quote
-- xeaq_ySe0AU3Ibw2MEnls0vPhjSXf, byte-identical intent_hash, both
-- awaiting_payment, both $103.50. The server was not wrong by its own contract:
-- research_early_access_commit_cart_checkout deduplicates on
-- idempotency_key_hash alone, and the browser presented two different keys. The
-- client cleared its attempt key on success while leaving the quote live, so a
-- second confirm minted a fresh key and bought the same cart twice. The
-- database had every fact needed to notice (same quote_id, same intent_hash,
-- both stored) and no constraint that used them.
--
-- WHAT THIS MIGRATION DOES, IN ORDER, AND WHY THE ORDER MATTERS.
--
--   1. Adds the disposition columns. Additive, nullable, no default backfill.
--   2. Dispositions the ONE historical duplicate, fail-closed, only if every
--      precondition still holds.
--   3. Only then creates the partial unique index. A plain UNIQUE (quote_id)
--      would fail to create against production, because two live rows share
--      that quote today. Creating the index before step 2 would fail for the
--      same reason, which is why the order is not cosmetic.
--   4. Teaches the commit function to replay the existing active checkout
--      instead of creating a second one.
--   5. Refuses every money and release mutation against a superseded checkout.
--
-- WHY UPDATE IS LEGITIMATE HERE. research_early_access_cart_checkouts is
-- deliberately NOT under research_early_access_cart_immutable: its payment_state
-- has to advance awaiting_payment -> under_review -> payment_verified. The
-- append-only guarantee lives on the evidence tables (events, items, invoices,
-- settlements, releases, proofs, receipts) and this migration does not weaken
-- it. Nothing is deleted anywhere. The duplicate keeps its entire historical
-- row and stays readable for audit.

-- 1. THE DISPOSITION COLUMNS -------------------------------------------------

alter table public.research_early_access_cart_checkouts
  add column if not exists disposition text,
  add column if not exists superseded_by text,
  add column if not exists disposition_actor text,
  add column if not exists disposition_at timestamptz;

-- All four move together or none of them do. A half-written disposition is a
-- row nobody can interpret: superseded by what, decided by whom, when.
alter table public.research_early_access_cart_checkouts
  drop constraint if exists research_ea_cart_checkout_disposition_check;
alter table public.research_early_access_cart_checkouts
  add constraint research_ea_cart_checkout_disposition_check check (
    (
      disposition is null
      and superseded_by is null
      and disposition_actor is null
      and disposition_at is null
    )
    or (
      disposition = 'duplicate_superseded'
      and superseded_by is not null
      and disposition_actor is not null
      and disposition_at is not null
      and superseded_by <> checkout_number
    )
  );

comment on column public.research_early_access_cart_checkouts.disposition is
  'NULL means active. A non-null disposition removes the row from the one-active-checkout-per-quote index and refuses every money and release mutation against it.';

-- The audit vocabulary gains the event this migration writes. The constraint is
-- replaced rather than widened in place because it was declared inline.
alter table public.research_early_access_cart_events
  drop constraint if exists research_early_access_cart_events_event_type_check;
alter table public.research_early_access_cart_events
  add constraint research_early_access_cart_events_event_type_check check (
    event_type in (
      'quote_created','checkout_created','proof_recorded','payment_verified',
      'child_release_created','shipment_updated','payment_rejected',
      'checkout_superseded'
    )
  );

-- 2. THE HISTORICAL REMEDIATION, FAIL-CLOSED ---------------------------------
--
-- Named constants, not a pattern match. This dispositions exactly one known
-- pair and refuses to guess about anything else. On a database that has never
-- seen these orders (a fresh container, a shape test, a rebuilt environment)
-- the block is a no-op, which is why it is safe to ship in the same file.
--
-- THE CANONICAL CHOICE IS DELIBERATE AND IS NOT THE SAME RULE THE CODE USES
-- GOING FORWARD. The later order is canonical here because it is the one the
-- customer was actually shown in the UI, which is the founder's decision on
-- 2026-08-09. Once the index below exists, the FIRST checkout to claim a quote
-- is the one that survives, and a second attempt replays it. Two different
-- rules, both defensible, and pretending they are one rule would be the lie.

do $$
declare
  c_duplicate constant text := 'XEC-063A962A0053A65324F21E7F';
  c_canonical constant text := 'XEC-E1703CC63BBE89E6839E24C1';
  c_actor     constant text := 'founder:samuel-boadu:2026-08-09-duplicate-disposition';
  v_duplicate public.research_early_access_cart_checkouts%rowtype;
  v_canonical public.research_early_access_cart_checkouts%rowtype;
  v_blocking  integer;
  v_at        constant timestamptz := now();
begin
  select * into v_duplicate
    from public.research_early_access_cart_checkouts
   where checkout_number = c_duplicate;

  if not found then
    -- Not the production database. Nothing to remediate.
    raise notice 'cart duplicate remediation: %, not present, skipping', c_duplicate;
  else
    if v_duplicate.disposition is not null then
      raise notice 'cart duplicate remediation: % already dispositioned', c_duplicate;
    else
      select * into v_canonical
        from public.research_early_access_cart_checkouts
       where checkout_number = c_canonical;
      if not found then
        raise exception
          'cart duplicate remediation aborted: duplicate % exists but canonical % does not',
          c_duplicate, c_canonical using errcode = '23514';
      end if;

      -- Every precondition, checked before anything is written. Any drift means
      -- the world moved since this was designed, and guessing would be worse
      -- than stopping.
      if v_duplicate.quote_id is distinct from v_canonical.quote_id then
        raise exception 'cart duplicate remediation aborted: quote_id differs' using errcode = '23514';
      end if;
      if v_duplicate.customer_ref is distinct from v_canonical.customer_ref then
        raise exception 'cart duplicate remediation aborted: customer_ref differs' using errcode = '23514';
      end if;
      if v_duplicate.intent_hash is distinct from v_canonical.intent_hash then
        raise exception 'cart duplicate remediation aborted: intent_hash differs' using errcode = '23514';
      end if;
      if v_duplicate.payment_state <> 'awaiting_payment' then
        raise exception
          'cart duplicate remediation aborted: duplicate payment_state is %, expected awaiting_payment',
          v_duplicate.payment_state using errcode = '23514';
      end if;
      if v_canonical.payment_state <> 'awaiting_payment' then
        raise exception
          'cart duplicate remediation aborted: canonical payment_state is %, expected awaiting_payment',
          v_canonical.payment_state using errcode = '23514';
      end if;

      select
        (select count(*) from public.research_early_access_cart_settlements
          where cart_checkout_id = v_duplicate.id)
      + (select count(*) from public.research_early_access_cart_receipts
          where cart_checkout_id = v_duplicate.id)
      + (select count(*) from public.research_early_access_cart_child_releases
          where cart_checkout_id = v_duplicate.id)
      + (select count(*) from public.research_early_access_cart_supplier_outbox
          where cart_checkout_id = v_duplicate.id)
      + (select count(*) from public.research_early_access_cart_external_proofs
          where cart_checkout_id = v_duplicate.id)
        into v_blocking;

      if v_blocking <> 0 then
        raise exception
          'cart duplicate remediation aborted: duplicate % carries % settlement/receipt/release/outbox/proof rows',
          c_duplicate, v_blocking using errcode = '23514';
      end if;

      update public.research_early_access_cart_checkouts
         set disposition       = 'duplicate_superseded',
             superseded_by     = c_canonical,
             disposition_actor = c_actor,
             disposition_at    = v_at
       where id = v_duplicate.id;

      insert into public.research_early_access_cart_events(
        cart_checkout_id, checkout_number, event_type, actor_scope_hash, metadata, occurred_at
      ) values (
        v_duplicate.id,
        v_duplicate.checkout_number,
        'checkout_superseded',
        encode(
          extensions.digest(
            convert_to('xenios:ea-cart-actor:v1|' || c_actor, 'utf8'),
            'sha256'
          ),
          'hex'
        ),
        jsonb_build_object(
          'supersededBy', c_canonical,
          'reason', 'duplicate_submission_same_quote_and_intent',
          'quoteId', v_duplicate.quote_id
        ),
        v_at
      );

      raise notice 'cart duplicate remediation: % superseded by %', c_duplicate, c_canonical;
    end if;
  end if;
end;
$$;

-- 3. THE INVARIANT -----------------------------------------------------------
--
-- Asserted before the index is built, so a second unknown collision reports
-- itself in words instead of as an opaque CREATE INDEX failure.

do $$
declare
  v_collisions integer;
begin
  select count(*) into v_collisions from (
    select quote_id
      from public.research_early_access_cart_checkouts
     where disposition is null
     group by quote_id
    having count(*) > 1
  ) collisions;

  if v_collisions <> 0 then
    raise exception
      'cannot enforce one active checkout per quote: % quote(s) still have more than one active checkout. Disposition them truthfully first; do not delete history.',
      v_collisions using errcode = '23505';
  end if;
end;
$$;

create unique index if not exists research_ea_cart_checkout_active_quote_uidx
  on public.research_early_access_cart_checkouts (quote_id)
  where disposition is null;

-- 4. THE COMMIT FUNCTION -----------------------------------------------------
--
-- Two defences, because the SELECT alone is a race. The lookup answers the
-- ordinary repeat submit; the unique index answers two requests arriving at the
-- same instant, where both SELECTs miss and one INSERT has to lose. The loser
-- does not fail: it re-reads the winner and replays it, so the customer who
-- double-clicked sees ONE order either way.

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
  v_constraint text;
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

  -- THE FIX. A new idempotency key is not a new order when the quote already
  -- has an active checkout. Ownership and intent are re-checked here rather
  -- than assumed: a quote whose active checkout belongs to someone else, or
  -- whose intent no longer matches, must never be silently replayed to the
  -- caller, because that would hand one customer another customer's order.
  select * into v_existing
    from public.research_early_access_cart_checkouts
   where quote_id = p_checkout->>'quoteId'
     and disposition is null;
  if found then
    if v_existing.customer_ref is distinct from p_checkout->>'customerRef'
       or v_existing.intent_hash is distinct from p_checkout->>'intentHash'
    then
      return jsonb_build_object(
        'committed', false,
        'replayed', false,
        'reason', 'quote_has_active_checkout',
        'record', null
      );
    end if;
    return jsonb_build_object(
      'committed', false,
      'replayed', true,
      'reason', 'quote_has_active_checkout',
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
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'research_ea_cart_checkout_active_quote_uidx' then
      -- Lost a concurrent race for the same quote. The winner is committed by
      -- the time this fires, so re-read it and replay. The losing transaction's
      -- own partial rows are gone: this is one transaction, and the block above
      -- rolled back before this handler ran.
      select * into v_existing
        from public.research_early_access_cart_checkouts
       where quote_id = p_checkout->>'quoteId'
         and disposition is null;
      if found
         and v_existing.customer_ref is not distinct from p_checkout->>'customerRef'
         and v_existing.intent_hash is not distinct from p_checkout->>'intentHash'
      then
        return jsonb_build_object(
          'committed', false,
          'replayed', true,
          'reason', 'quote_has_active_checkout',
          'record', v_existing.record
        );
      end if;
      return jsonb_build_object(
        'committed', false,
        'replayed', false,
        'reason', 'quote_has_active_checkout',
        'record', null
      );
    end if;
    -- A child order number collision is a server-generator fault. No partial
    -- rows survive because the function is one transaction.
    raise;
end;
$$;

-- 5. A SUPERSEDED CHECKOUT IS FINANCIALLY INERT ------------------------------
--
-- Enforced by trigger on every table that represents money moving or stock
-- being released, rather than inside each RPC. A rule written once at the table
-- cannot be bypassed by a path nobody remembered to update, including paths
-- that do not exist yet.

create or replace function public.research_early_access_cart_refuse_superseded()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_disposition text;
  v_number text;
begin
  select disposition, checkout_number
    into v_disposition, v_number
    from public.research_early_access_cart_checkouts
   where id = new.cart_checkout_id;

  if v_disposition is not null then
    raise exception
      'cart checkout % is % and cannot take money or release stock', v_number, v_disposition
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create or replace trigger research_ea_cart_proofs_refuse_superseded
  before insert on public.research_early_access_cart_external_proofs
  for each row execute function public.research_early_access_cart_refuse_superseded();

create or replace trigger research_ea_cart_settlements_refuse_superseded
  before insert on public.research_early_access_cart_settlements
  for each row execute function public.research_early_access_cart_refuse_superseded();

create or replace trigger research_ea_cart_releases_refuse_superseded
  before insert on public.research_early_access_cart_child_releases
  for each row execute function public.research_early_access_cart_refuse_superseded();

create or replace trigger research_ea_cart_receipts_refuse_superseded
  before insert on public.research_early_access_cart_receipts
  for each row execute function public.research_early_access_cart_refuse_superseded();

create or replace trigger research_ea_cart_outbox_refuse_superseded
  before insert on public.research_early_access_cart_supplier_outbox
  for each row execute function public.research_early_access_cart_refuse_superseded();

-- The payment state of a superseded checkout is frozen too. Without this, an
-- operator could still walk the duplicate to payment_verified even though no
-- settlement row could ever be written for it, leaving a checkout that claims
-- to be paid and never can be.
create or replace function public.research_early_access_cart_freeze_superseded()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if old.disposition is not null and new.payment_state is distinct from old.payment_state then
    raise exception
      'cart checkout % is % and its payment state is frozen', old.checkout_number, old.disposition
      using errcode = '55000';
  end if;
  if old.disposition is not null and new.disposition is distinct from old.disposition then
    raise exception
      'cart checkout % is already %', old.checkout_number, old.disposition
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace trigger research_ea_cart_checkout_freeze_superseded
  before update on public.research_early_access_cart_checkouts
  for each row execute function public.research_early_access_cart_freeze_superseded();
