-- M66 behavioural verification for PostgreSQL 16 and 17.
-- Run only after explicit approval to apply M66 to a disposable database.
-- Every fixture is rolled back; the migration itself writes no business row.

begin;

do $verify_m66$
declare
  v_checkout uuid;
  v_item uuid;
  v_count integer;
  v_expr text;
  v_failed boolean;
begin
  if current_setting('server_version_num')::integer < 160000
     or current_setting('server_version_num')::integer >= 180000 then
    raise exception 'M66 verifier requires PostgreSQL 16 or 17';
  end if;

  foreach v_expr in array array[
    'research_early_access_cart_items',
    'research_early_access_cart_child_releases'
  ] loop
    select count(*) into v_count
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_expr
      and con.contype = 'c'
      and con.convalidated
      and con.conname = v_expr || '_quantity_band'
      and regexp_replace(pg_get_expr(con.conbin, con.conrelid), '\s+', '', 'g')
        = '((quantity>=1)AND(quantity<=50))';
    if v_count <> 1 then
      raise exception 'FAIL public.% lacks the exact validated M66 band', v_expr;
    end if;
    raise notice 'PASS public.% has exact 1..50 M66 band', v_expr;
  end loop;

  select count(*) into v_count
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'research_early_access_cart_items'
    and con.contype = 'c'
    and regexp_replace(pg_get_expr(con.conbin, con.conrelid), '\s+', '', 'g')
      = '(subtotal_cents=(unit_price_cents*quantity))';
  if v_count <> 1 then
    raise exception 'FAIL subtotal = unit price * quantity identity is absent';
  end if;
  raise notice 'PASS money identity survived M66';

  insert into public.research_early_access_cart_quotes (
    quote_id, customer_ref, intent_hash, quote_hash, record, quoted_at, expires_at
  ) values (
    'xeaq_m66verify0000000001', 'eac_' || repeat('a', 32), repeat('a', 64),
    repeat('e', 64), '{}'::jsonb, now(), now() + interval '1 hour'
  );

  insert into public.research_early_access_cart_checkouts (
    checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id,
    payment_state, currency, subtotal_cents, discount_cents, shipping_cents,
    tax_cents, payable_total_cents, record, placed_at
  ) values (
    'XEC-M66VERIFY0000000001', 'eac_' || repeat('a', 32), repeat('f', 64),
    repeat('a', 64), 'xeaq_m66verify0000000001', 'awaiting_payment', 'USD',
    50000, 0, 0, 0, 50000, '{}'::jsonb, now()
  ) returning id into v_checkout;

  insert into public.research_early_access_cart_items (
    cart_checkout_id, line_index, order_number, product_id, variant_id, sku,
    quantity, supplier_id, supplier_sku, unit_price_cents, subtotal_cents,
    discount_cents, payable_cents, record
  ) values (
    v_checkout, 0, 'XEA-CART-M66VERIFY-01', 'prod-m66', 'var-m66', 'SKU-M66',
    50, 'sup-m66', 'SUPSKU-M66', 1000, 50000, 0, 50000, '{}'::jsonb
  ) returning id into v_item;
  raise notice 'PASS durable cart item quantity 50 is accepted';

  v_failed := false;
  begin
    insert into public.research_early_access_cart_items (
      cart_checkout_id, line_index, order_number, product_id, variant_id, sku,
      quantity, supplier_id, supplier_sku, unit_price_cents, subtotal_cents,
      discount_cents, payable_cents, record
    ) values (
      v_checkout, 1, 'XEA-CART-M66VERIFY-51', 'prod-m66', 'var-m66b', 'SKU-M66B',
      51, 'sup-m66', 'SUPSKU-M66', 1000, 51000, 0, 51000, '{}'::jsonb
    );
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL cart item quantity 51 was accepted'; end if;
  raise notice 'PASS durable cart item quantity 51 is refused';

  -- A wrong subtotal at the new ceiling must still fail independently of the band.
  v_failed := false;
  begin
    insert into public.research_early_access_cart_items (
      cart_checkout_id, line_index, order_number, product_id, variant_id, sku,
      quantity, supplier_id, supplier_sku, unit_price_cents, subtotal_cents,
      discount_cents, payable_cents, record
    ) values (
      v_checkout, 2, 'XEA-CART-M66VERIFY-MONEY', 'prod-m66', 'var-m66c', 'SKU-M66C',
      50, 'sup-m66', 'SUPSKU-M66', 1000, 49999, 0, 49999, '{}'::jsonb
    );
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL wrong subtotal was accepted at quantity 50'; end if;
  raise notice 'PASS money identity rejects a forged subtotal at quantity 50';

  foreach v_count in array array[0, 51] loop
    v_failed := false;
    begin
      insert into public.research_early_access_cart_child_releases (
        cart_checkout_id, cart_item_id, release_id, order_number, supplier_id,
        supplier_sku, quantity, record, released_at
      ) values (
        v_checkout, v_item, 'xea-cart-release:XEA-CART-M66VERIFY-' || v_count,
        'XEA-CART-M66VERIFY-' || v_count, 'sup-m66', 'SUPSKU-M66', v_count,
        '{}'::jsonb, now()
      );
    exception when check_violation then v_failed := true;
    end;
    if not v_failed then raise exception 'FAIL child release quantity % was accepted', v_count; end if;
    raise notice 'PASS child release quantity % is refused', v_count;
  end loop;

  insert into public.research_early_access_cart_child_releases (
    cart_checkout_id, cart_item_id, release_id, order_number, supplier_id,
    supplier_sku, quantity, record, released_at
  ) values (
    v_checkout, v_item, 'xea-cart-release:XEA-CART-M66VERIFY-50',
    'XEA-CART-M66VERIFY-50', 'sup-m66', 'SUPSKU-M66', 50, '{}'::jsonb, now()
  );
  raise notice 'PASS child release quantity 50 is accepted';
end;
$verify_m66$;

rollback;
