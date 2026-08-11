-- M65 behavioural verification: the Early Access quantity band is 1..20.
--
-- Raises on the first failed assertion, so a non-zero psql exit IS the failure
-- signal. Every satisfied assertion emits `NOTICE: PASS ...` so the evidence is
-- readable in the harness output.
--
-- This suite writes real fixture rows and then ROLLS THE WHOLE THING BACK, so
-- the row counts it is checked against are unchanged when it finishes.
--
-- WHY A ROLLBACK RATHER THAN A DELETE. The completion migration puts an
-- append-only trigger on research_early_access_cart_child_releases, so a
-- fixture release cannot be deleted: "early access cart completion evidence is
-- immutable" is the database refusing, correctly, to let evidence be tidied
-- away. Rolling back is the only way to exercise a real INSERT against the real
-- constraints and still leave nothing behind, and it also means a failed
-- assertion cannot strand half a fixture.

begin;

do $verify$
declare
  v_checkout uuid;
  v_item uuid;
  v_count integer;
  v_definition text;
  v_failed boolean;
begin
  -- -------------------------------------------------------------------------
  -- 1. The canonical band exists, is named, and reads 1..20 on both tables.
  -- -------------------------------------------------------------------------
  foreach v_definition in array array[
    'research_early_access_cart_items',
    'research_early_access_cart_child_releases'
  ] loop
    select count(*)
    into v_count
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_definition
      and con.contype = 'c'
      and con.conname = v_definition || '_quantity_band'
      and pg_get_constraintdef(con.oid) ~ 'quantity >= 1'
      and pg_get_constraintdef(con.oid) ~ 'quantity <= 20';
    if v_count <> 1 then
      raise exception 'FAIL public.% has % canonical quantity band(s), expected 1', v_definition, v_count;
    end if;
    raise notice 'PASS public.% carries the canonical 1..20 quantity band', v_definition;

    select count(*)
    into v_count
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_definition
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~ 'quantity <= 3';
    if v_count <> 0 then
      raise exception 'FAIL public.% still carries a 1..3 band', v_definition;
    end if;
    raise notice 'PASS public.% carries no surviving 1..3 band', v_definition;
  end loop;

  -- -------------------------------------------------------------------------
  -- 2. THE NON-QUANTITY CONSTRAINTS SURVIVED. The subtotal identity mentions
  --    the same column and must be untouched, or M65 widened more than its
  --    mandate.
  -- -------------------------------------------------------------------------
  select count(*)
  into v_count
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'research_early_access_cart_items'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ~ 'subtotal_cents'
    and pg_get_constraintdef(con.oid) ~ 'unit_price_cents'
    and pg_get_constraintdef(con.oid) ~ 'quantity';
  if v_count < 1 then
    raise exception 'FAIL the subtotal = unit_price * quantity identity is gone';
  end if;
  raise notice 'PASS the subtotal/unit-price/quantity identity survived M65';

  for v_definition in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'research_early_access_cart_items'
      and con.contype = 'c'
      and con.conname in (
        'research_early_access_cart_items_line_index_check',
        'research_early_access_cart_items_unit_price_cents_check'
      )
  loop
    raise notice 'PASS unrelated constraint % survived', v_definition;
  end loop;

  -- -------------------------------------------------------------------------
  -- 3. UNRELATED QUANTITY DOMAINS ARE UNTOUCHED. M65 names two tables; every
  --    other quantity constraint in the schema must read exactly as before.
  -- -------------------------------------------------------------------------
  if to_regclass('public.research_early_access_reservations') is not null then
    select count(*)
    into v_count
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'research_early_access_reservations'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~ 'quantity <= 20';
    if v_count <> 0 then
      raise exception 'FAIL M65 widened public.research_early_access_reservations, which is not its mandate';
    end if;
    raise notice 'PASS the reservation quantity domain was not widened';
  end if;

  -- -------------------------------------------------------------------------
  -- 4. BEHAVIOUR. Twenty is accepted, twenty-one and zero are refused, at the
  --    database itself rather than by an application check.
  -- -------------------------------------------------------------------------
  insert into public.research_early_access_cart_quotes (
    quote_id, customer_ref, intent_hash, quote_hash, record, quoted_at, expires_at
  ) values (
    'xeaq_m65verify0000000001', 'eac_' || repeat('a', 32), repeat('a', 64),
    repeat('e', 64), '{}'::jsonb, now(), now() + interval '1 hour'
  );

  insert into public.research_early_access_cart_checkouts (
    checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id,
    payment_state, currency, subtotal_cents, discount_cents, shipping_cents,
    tax_cents, payable_total_cents, record, placed_at
  ) values (
    'XEC-M65VERIFY0000000001', 'eac_' || repeat('a', 32), repeat('f', 64),
    repeat('a', 64), 'xeaq_m65verify0000000001',
    'awaiting_payment', 'USD', 20000, 0, 0, 0, 20000, '{}'::jsonb, now()
  )
  returning id into v_checkout;

  insert into public.research_early_access_cart_items (
    cart_checkout_id, line_index, order_number, product_id, variant_id, sku,
    quantity, supplier_id, supplier_sku, unit_price_cents, subtotal_cents,
    discount_cents, payable_cents, record
  ) values (
    v_checkout, 0, 'XEA-CART-M65VERIFY-01', 'prod-m65', 'var-m65', 'SKU-M65',
    20, 'sup-m65', 'SUPSKU-M65', 1000, 20000, 0, 20000, '{}'::jsonb
  )
  returning id into v_item;
  raise notice 'PASS a durable cart item of quantity 20 is accepted';

  -- 21 must be refused BY THE CONSTRAINT.
  v_failed := false;
  begin
    insert into public.research_early_access_cart_items (
      cart_checkout_id, line_index, order_number, product_id, variant_id, sku,
      quantity, supplier_id, supplier_sku, unit_price_cents, subtotal_cents,
      discount_cents, payable_cents, record
    ) values (
      v_checkout, 1, 'XEA-CART-M65VERIFY-02', 'prod-m65', 'var-m65b', 'SKU-M65B',
      21, 'sup-m65', 'SUPSKU-M65', 1000, 21000, 0, 21000, '{}'::jsonb
    );
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL a cart item of quantity 21 was accepted';
  end if;
  raise notice 'PASS a durable cart item of quantity 21 is refused by the database';

  -- THE LOWER BOUND IS TESTED ON THE RELEASE TABLE, NOT ON THE ITEM TABLE.
  --
  -- A cart item of quantity 0 can never be inserted whatever the band says: the
  -- subtotal identity forces subtotal_cents to 0, and `discount_cents <
  -- subtotal_cents` and `payable_cents > 0` are then both unsatisfiable. An
  -- insert that fails there would prove nothing about the band, so the lower
  -- bound is exercised on research_early_access_cart_child_releases, whose only
  -- constraint on the column IS the band.
  --
  -- These two refusals run BEFORE the accepted release, so `cart_item_id`
  -- is still free and a unique violation cannot be mistaken for a band
  -- violation.
  v_failed := false;
  begin
    insert into public.research_early_access_cart_child_releases (
      cart_checkout_id, cart_item_id, release_id, order_number, supplier_id,
      supplier_sku, quantity, record, released_at
    ) values (
      v_checkout, v_item, 'xea-cart-release:XEA-CART-M65VERIFY-98',
      'XEA-CART-M65VERIFY-98', 'sup-m65', 'SUPSKU-M65', 0, '{}'::jsonb, now()
    );
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL a child release of quantity 0 was accepted';
  end if;
  raise notice 'PASS a durable child release of quantity 0 is still refused';

  v_failed := false;
  begin
    insert into public.research_early_access_cart_child_releases (
      cart_checkout_id, cart_item_id, release_id, order_number, supplier_id,
      supplier_sku, quantity, record, released_at
    ) values (
      v_checkout, v_item, 'xea-cart-release:XEA-CART-M65VERIFY-99',
      'XEA-CART-M65VERIFY-99', 'sup-m65', 'SUPSKU-M65', 21, '{}'::jsonb, now()
    );
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL a child release of quantity 21 was accepted';
  end if;
  raise notice 'PASS a durable child release of quantity 21 is refused by the database';

  -- And twenty is accepted on the same table.
  insert into public.research_early_access_cart_child_releases (
    cart_checkout_id, cart_item_id, release_id, order_number, supplier_id,
    supplier_sku, quantity, record, released_at
  ) values (
    v_checkout, v_item, 'xea-cart-release:XEA-CART-M65VERIFY-01',
    'XEA-CART-M65VERIFY-01', 'sup-m65', 'SUPSKU-M65', 20, '{}'::jsonb, now()
  );
  raise notice 'PASS a durable child release of quantity 20 is accepted';

  raise notice 'PASS every band assertion held against real durable rows';
end;
$verify$;

-- Nothing this suite wrote survives. See the note at the top: the release table
-- is append-only, so rollback is the only honest cleanup.
rollback;
