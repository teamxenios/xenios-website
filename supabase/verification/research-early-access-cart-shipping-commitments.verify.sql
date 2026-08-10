-- M64 behavioural verification: the shipping-commitment work list.
-- Disposable databases only. ON_ERROR_STOP must be enabled by the caller.
--
-- Runs AFTER the cart schema, M62 and M64. Proves the routine exists with the
-- exact privilege shape, that the M62 table boundary is NOT widened, that the
-- routine enumerates only currently relevant due commitments, that it derives
-- the shipment stage from durable events under the same supersession rule the
-- application projection uses, that its ordering is deterministic, and that it
-- writes nothing at all.
--
-- Every probe row below is created inside a plpgsql subtransaction that is
-- deliberately aborted, so this file leaves the database exactly as it found
-- it. The row-count assertions at the end prove that.

create or replace function pg_temp.want(ok boolean, label text) returns void
language plpgsql as $$ begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

create or replace function pg_temp.routine_oid() returns oid
language sql stable as $$
  select p.oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'research_early_access_cart_shipping_commitments_due'
    and p.pronargs = 1
    and p.proargtypes[0] = 'pg_catalog.timestamptz'::regtype
$$;

-- ---------------------------------------------------------------------------
-- A. Structure and privilege boundary.
-- ---------------------------------------------------------------------------

select pg_temp.want(pg_temp.routine_oid() is not null,
  'A1 the shipping-commitment routine exists with the exact (timestamptz) signature');

select pg_temp.want(
  (select p.provolatile from pg_proc p where p.oid = pg_temp.routine_oid()) = 's',
  'A2 the routine is STABLE, so it cannot write');

select pg_temp.want(
  (select p.prosecdef from pg_proc p where p.oid = pg_temp.routine_oid()),
  'A3 the routine is SECURITY DEFINER');

select pg_temp.want(
  (select p.proconfig from pg_proc p where p.oid = pg_temp.routine_oid())
    @> array['search_path=pg_catalog'],
  'A4 the routine pins search_path to pg_catalog');

select pg_temp.want(
  not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) acl
    where p.oid = pg_temp.routine_oid()
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'A5 PUBLIC cannot execute the routine');

select pg_temp.want(
  not has_function_privilege('anon', pg_temp.routine_oid(), 'EXECUTE'),
  'A6 anon cannot execute the routine');

select pg_temp.want(
  not has_function_privilege('authenticated', pg_temp.routine_oid(), 'EXECUTE'),
  'A7 authenticated cannot execute the routine');

select pg_temp.want(
  has_function_privilege('service_role', pg_temp.routine_oid(), 'EXECUTE'),
  'A8 service_role can execute the routine');

-- THE POINT OF M64: the routine is the ONLY way in. If either of these ever
-- becomes true, M64 widened exactly what it exists to avoid widening.
select pg_temp.want(
  not has_table_privilege('service_role',
    'public.research_early_access_cart_settlement_hardening', 'SELECT'),
  'A9 service_role still has NO direct SELECT on the settlement hardening table');

select pg_temp.want(
  not has_table_privilege('service_role',
    'public.research_early_access_cart_fulfilment_events', 'SELECT'),
  'A10 service_role still has NO direct SELECT on the fulfilment events table');

select pg_temp.want(
  not has_table_privilege('anon',
    'public.research_early_access_cart_settlement_hardening', 'SELECT')
  and not has_table_privilege('authenticated',
    'public.research_early_access_cart_settlement_hardening', 'SELECT'),
  'A11 no browser role gained SELECT on the settlement hardening table');

-- The routine's own text may not carry a write verb. Belt and braces beside
-- the STABLE volatility check: a future edit that smuggled a write in would
-- have to change this file too.
select pg_temp.want(
  (select prosrc from pg_proc where oid = pg_temp.routine_oid())
    !~* '(^|[^a-z_])(insert|update|delete|truncate|alter|drop|grant|revoke)([^a-z_]|$)',
  'A12 the routine body contains no write or privilege statement');

-- ---------------------------------------------------------------------------
-- B. Fixtures. One settled, hardened checkout with a chosen ship_by_at and a
-- chosen number of shipped child orders.
-- ---------------------------------------------------------------------------

create or replace function pg_temp.seed_package() returns text
language plpgsql as $$
declare v_version text := 'aaaaaaaaaaaaaaaaaaaaaaaa';
begin
  insert into public.research_early_access_agreement_packages(
    package_id, package_version, requirements, registered_by
  ) values ('m64-verify', v_version, '[{"documentId":"XR-LEGAL-1"}]'::jsonb, 'verify@xenios')
  on conflict (package_version) do nothing;
  return v_version;
end $$;

create or replace function pg_temp.seed_checkout(
  p_checkout text,
  p_ship_by timestamptz,
  p_items integer,
  p_shipped integer
) returns void language plpgsql as $$
declare
  v_key           text := md5(p_checkout);
  v_quote         text := 'xeaq_' || replace(p_checkout, 'XEC-', '');
  v_customer      text := 'eac_' || v_key;
  v_checkout_id   uuid;
  v_settlement_id uuid;
  v_txn_id        uuid;
  v_attestation   uuid;
  v_submission    uuid;
  v_item_id       uuid;
  v_index         integer;
  v_package       text := pg_temp.seed_package();
begin
  insert into public.research_early_access_cart_quotes(
    quote_id, customer_ref, intent_hash, quote_hash, record, quoted_at, expires_at
  ) values (
    v_quote, v_customer, v_key || v_key, v_key || v_key, '{}'::jsonb,
    now(), now() + interval '1 day'
  );

  insert into public.research_early_access_cart_checkouts(
    checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id,
    payment_state, currency, subtotal_cents, discount_cents, shipping_cents,
    tax_cents, payable_total_cents, record, placed_at
  ) values (
    p_checkout, v_customer, md5(p_checkout || 'i') || v_key, v_key || v_key, v_quote,
    'payment_verified', 'USD', 10000, 0, 0, 0, 10000, '{}'::jsonb, now()
  ) returning id into v_checkout_id;

  insert into public.research_early_access_cart_settlements(
    cart_checkout_id, external_transaction_id, reviewed_evidence_ref,
    verified_amount_cents, verified_currency, actor_id, record, settled_at
  ) values (
    v_checkout_id, 'TX-' || upper(substr(v_key, 1, 16)), 'eaext.' || v_key,
    10000, 'USD', 'verify@xenios', '{}'::jsonb, now()
  ) returning id into v_settlement_id;

  insert into public.research_early_access_cart_transaction_ids(
    cart_settlement_id, cart_checkout_id, external_transaction_id,
    canonical_transaction_id, recorded_at
  ) values (
    v_settlement_id, v_checkout_id, 'TX-' || upper(substr(v_key, 1, 16)),
    'TX' || upper(substr(v_key, 1, 16)), now()
  ) returning id into v_txn_id;

  insert into public.research_early_access_agreement_attestations(
    attestation_id, cart_checkout_id, member_id, package_id, package_version,
    signed_at, recorded_by
  ) values (
    'eaa_' || substr(v_key, 1, 24), v_checkout_id, gen_random_uuid(), 'm64-verify',
    v_package, '{"XR-LEGAL-1":"2026-08-10T00:00:00Z"}'::jsonb, 'verify@xenios'
  ) returning id into v_attestation;

  insert into public.research_early_access_proof_submissions(
    submission_id, submission_key, cart_checkout_id, customer_ref, member_id,
    method_code, method_name, registry_version, presented_at, filename,
    content_type, byte_size, proof_sha256, package_version,
    internal_email_acceptance, provider_message_id, accepted_at
  ) values (
    'eaps_' || substr(v_key, 1, 24), 'eask_' || substr(v_key, 1, 24), v_checkout_id,
    v_customer, gen_random_uuid(), 'zelle', 'Zelle', 'v1', now(), 'proof.pdf',
    'application/pdf', 1024, v_key || v_key, v_package,
    'accepted', 'provider-message', now()
  ) returning id into v_submission;

  insert into public.research_early_access_cart_settlement_hardening(
    cart_settlement_id, cart_checkout_id, transaction_identity_id,
    agreement_attestation_id, proof_submission_id, agreement_package_version,
    actor_id, confirmed_funds_received, confirmed_amount_and_reference,
    payment_verified_at, ship_by_at
  ) values (
    v_settlement_id, v_checkout_id, v_txn_id, v_attestation, v_submission,
    v_package, 'verify@xenios', true, true,
    p_ship_by - interval '72 hours', p_ship_by
  );

  for v_index in 0 .. (p_items - 1) loop
    insert into public.research_early_access_cart_items(
      cart_checkout_id, line_index, order_number, product_id, variant_id, sku,
      quantity, supplier_id, supplier_sku, unit_price_cents, subtotal_cents,
      discount_cents, payable_cents, record
    ) values (
      v_checkout_id, v_index,
      'XEA-CART-' || upper(substr(md5(p_checkout || v_index::text), 1, 16)),
      'prod-' || v_index, 'variant-' || v_index, 'SKU-' || v_index, 1,
      'supplier', 'SS-' || v_index,
      10000, 10000, 0, 10000, '{}'::jsonb
    ) returning id into v_item_id;

    if v_index < p_shipped then
      insert into public.research_early_access_cart_fulfilment_events(
        cart_checkout_id, cart_item_id, event_type, supersedes_event_id,
        metadata, actor_id
      ) values (
        v_checkout_id, v_item_id, 'shipment_shipped', null, '{}'::jsonb, 'verify@xenios'
      );
    end if;
  end loop;
end $$;

-- A checkout can only be dispositioned AFTER it is settled: M61's own trigger
-- refuses a settlement against an already-superseded checkout, which is exactly
-- the rule this fixture must not fight. So the superseded row is built like any
-- other and then dispositioned, the same order production would take.
create or replace function pg_temp.supersede(p_checkout text)
returns void language plpgsql as $$
begin
  update public.research_early_access_cart_checkouts
     set disposition       = 'duplicate_superseded',
         superseded_by     = 'XEC-M64VERIFYSURVIVOR000',
         disposition_actor = 'verify@xenios',
         disposition_at    = now()
   where checkout_number = p_checkout;
end $$;

create or replace function pg_temp.void_shipments(p_checkout text)
returns void language plpgsql as $$
declare v_event public.research_early_access_cart_fulfilment_events%rowtype;
begin
  for v_event in
    select e.*
      from public.research_early_access_cart_fulfilment_events e
      join public.research_early_access_cart_checkouts c on c.id = e.cart_checkout_id
     where c.checkout_number = p_checkout
       and e.event_type = 'shipment_shipped'
  loop
    insert into public.research_early_access_cart_fulfilment_events(
      cart_checkout_id, cart_item_id, event_type, supersedes_event_id, metadata, actor_id
    ) values (
      v_event.cart_checkout_id, v_event.cart_item_id, 'shipment_voided',
      v_event.id, '{}'::jsonb, 'verify@xenios'
    );
  end loop;
end $$;

create or replace function pg_temp.numbers(p_result jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(value ->> 'cartCheckoutNumber' order by ordinality), array[]::text[])
  from jsonb_array_elements(p_result) with ordinality
$$;

create or replace function pg_temp.stage_of(p_result jsonb, p_checkout text) returns text
language sql immutable as $$
  select value ->> 'stage'
  from jsonb_array_elements(p_result)
  where value ->> 'cartCheckoutNumber' = p_checkout
$$;

-- ---------------------------------------------------------------------------
-- C. Behaviour, on probe data that is rolled back.
-- ---------------------------------------------------------------------------

create or replace function pg_temp.behaviour() returns void
language plpgsql as $$
declare
  v_due        text := 'XEC-M64VERIFYDUE00000000';
  v_future     text := 'XEC-M64VERIFYFUTURE00000';
  v_superseded text := 'XEC-M64VERIFYSUPERSEDED0';
  v_shipped    text := 'XEC-M64VERIFYSHIPPED0000';
  v_partial    text := 'XEC-M64VERIFYPARTIAL0000';
  v_now        timestamptz := timestamptz '2026-08-10 12:00:00+00';
  v_result     jsonb;
  v_events_before bigint;
  v_events_after  bigint;
  v_hard_before   bigint;
  v_hard_after    bigint;
begin
  select count(*) into v_events_before
    from public.research_early_access_cart_fulfilment_events;
  select count(*) into v_hard_before
    from public.research_early_access_cart_settlement_hardening;

  begin
    perform pg_temp.seed_checkout(v_partial,     v_now - interval '4 hours', 2, 1);
    perform pg_temp.seed_checkout(v_shipped,     v_now - interval '3 hours', 2, 2);
    perform pg_temp.seed_checkout(v_superseded,  v_now - interval '2 hours', 1, 0);
    perform pg_temp.seed_checkout(v_due,         v_now - interval '1 hour',  1, 0);
    perform pg_temp.seed_checkout(v_future,      v_now + interval '1 hour',  1, 0);
    perform pg_temp.supersede(v_superseded);

    v_result := public.research_early_access_cart_shipping_commitments_due(v_now);

    perform pg_temp.want(pg_temp.stage_of(v_result, v_due) = 'processing',
      'C1 a due, active, unshipped checkout is in the work list as processing');

    perform pg_temp.want(pg_temp.stage_of(v_result, v_future) is null,
      'C2 a commitment whose ship_by_at is in the future is excluded');

    perform pg_temp.want(pg_temp.stage_of(v_result, v_superseded) is null,
      'C3 a superseded checkout is excluded');

    perform pg_temp.want(pg_temp.stage_of(v_result, v_shipped) = 'shipped',
      'C4 a fully shipped due commitment is reported with stage shipped, not hidden');

    perform pg_temp.want(pg_temp.stage_of(v_result, v_partial) = 'partially_shipped',
      'C5 a part-shipped due commitment is reported as partially_shipped');

    perform pg_temp.want(
      pg_temp.numbers(v_result) = array[v_partial, v_shipped, v_due],
      'C6 the work list is ordered by ship_by_at, oldest first, and holds only the due active rows');

    perform pg_temp.want(
      public.research_early_access_cart_shipping_commitments_due(v_now)::text = v_result::text,
      'C7 two calls over an unchanged database return byte-identical lists');

    -- Voiding retires the shipped facts, exactly as the application projection
    -- retires a superseded event.
    perform pg_temp.void_shipments(v_shipped);
    v_result := public.research_early_access_cart_shipping_commitments_due(v_now);
    perform pg_temp.want(pg_temp.stage_of(v_result, v_shipped) = 'processing',
      'C8 a voided shipment stops counting as shipped');

    perform pg_temp.want(
      public.research_early_access_cart_shipping_commitments_due(
        v_now - interval '10 days') = '[]'::jsonb,
      'C9 nothing is due before any commitment matures');

    -- No customer, supplier, payment, proof or transaction fact may leave.
    perform pg_temp.want(
      not (v_result::text ~* '(customer|email|supplier|proof|sha256|transaction|invoice|amount|reference|member)'),
      'C10 the work list carries no customer, supplier, payment, proof or transaction fact');

    perform pg_temp.want(
      (select bool_and(
         (select count(*) from jsonb_object_keys(value)) = 3
         and value ? 'cartCheckoutNumber' and value ? 'shipByAt' and value ? 'stage')
       from jsonb_array_elements(v_result)),
      'C11 every entry carries exactly the three contract fields');

    raise exception 'pg_temp rollback sentinel';
  exception when others then
    if sqlerrm <> 'pg_temp rollback sentinel' then raise; end if;
  end;

  select count(*) into v_events_after
    from public.research_early_access_cart_fulfilment_events;
  select count(*) into v_hard_after
    from public.research_early_access_cart_settlement_hardening;

  perform pg_temp.want(v_events_before = v_events_after,
    'C12 the verification left no fulfilment event behind');
  perform pg_temp.want(v_hard_before = v_hard_after,
    'C13 the verification left no settlement hardening row behind');
end $$;

select pg_temp.behaviour();
