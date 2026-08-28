\set ON_ERROR_STOP on

-- Sequential behavioral and rollback evidence for the unapplied candidate.
-- The companion shell harness supplies a real two-session concurrency race.

insert into public.research_orders (
  id, state, payment_reference, last_idempotency_key, updated_at
) values
  ('11111111-1111-4111-8111-111111111111', 'checkout_pending', null, 'checkout-prior', now()),
  ('22222222-2222-4222-8222-222222222222', 'payment_authorized', 'pi_early', 'evt_early_capture', now()),
  ('33333333-3333-4333-8333-333333333333', 'approved', 'pi_expected', 'admin-prior', now()),
  ('44444444-4444-4444-8444-444444444444', 'processing', 'pi_delivery', 'system-processing', now()),
  ('55555555-5555-4555-8555-555555555555', 'fulfilled', 'pi_no_shipment', 'system-fulfilled', now()),
  ('66666666-6666-4666-8666-666666666666', 'payment_captured', 'pi_refund', 'capture-prior', now()),
  ('88888888-8888-4888-8888-888888888888', 'approved', 'pi_crash', 'admin-approved', now());

insert into public.research_order_shipments (
  order_id, seq, owner, status, tracking_number, carrier
) values (
  '44444444-4444-4444-8444-444444444444', 0, 'mitch', 'processing', null, null
);

do $sequential_payment$
declare
  result jsonb;
begin
  result := public.research_commerce_webhook_claim_and_apply_v1(
    'stripe', 'evt_authorize', 'payment.authorized', repeat('a', 64),
    '2026-08-28T09:00:00Z', '11111111-1111-4111-8111-111111111111',
    'transition', 'payment_authorized', 'pi_authorized', null, null, null
  );
  if result is distinct from pg_catalog.jsonb_build_object(
    'capability', 'research_commerce_webhook_atomic_apply/v1',
    'providerName', 'stripe', 'eventId', 'evt_authorize',
    'payloadSha256', repeat('a', 64), 'outcome', 'applied'
  ) then
    raise exception 'verification: payment apply attestation mismatch: %', result;
  end if;
  if not exists (
    select 1 from public.research_orders
     where id = '11111111-1111-4111-8111-111111111111'
       and state = 'payment_authorized'
       and payment_reference = 'pi_authorized'
       and last_idempotency_key = 'checkout-prior'
  ) then
    raise exception 'verification: payment state/reference write or shared-key preservation failed';
  end if;
  if (select count(*) from public.research_order_state_events
       where order_id = '11111111-1111-4111-8111-111111111111'
         and idempotency_key = 'evt_authorize') <> 1
     or (select count(*) from public.research_provider_webhook_events
          where provider_name = 'stripe' and event_id = 'evt_authorize'
            and payload_sha256 = repeat('a', 64)
            and atomic_outcome = 'applied') <> 1 then
    raise exception 'verification: payment facts and inbox did not commit together';
  end if;

  result := public.research_commerce_webhook_claim_and_apply_v1(
    'stripe', 'evt_authorize', 'payment.authorized', repeat('a', 64),
    '2026-08-28T09:00:01Z', '11111111-1111-4111-8111-111111111111',
    'transition', 'payment_authorized', 'pi_authorized', null, null, null
  );
  if result ->> 'outcome' <> 'duplicate' then
    raise exception 'verification: exact replay was not duplicate: %', result;
  end if;

  result := public.research_commerce_webhook_claim_and_apply_v1(
    'stripe', 'evt_authorize', 'payment.authorized', repeat('b', 64),
    '2026-08-28T09:00:02Z', '11111111-1111-4111-8111-111111111111',
    'transition', 'payment_authorized', 'pi_authorized', null, null, null
  );
  if result ->> 'outcome' <> 'conflict'
     or (select count(*) from public.research_order_state_events
          where order_id = '11111111-1111-4111-8111-111111111111') <> 1 then
    raise exception 'verification: same-id different-payload conflict failed: %', result;
  end if;
end
$sequential_payment$;

do $non_claiming_refusals$
declare
  result jsonb;
begin
  result := public.research_commerce_webhook_claim_and_apply_v1(
    'stripe', 'evt_unknown_order', 'payment.captured', repeat('c', 64),
    '2026-08-28T09:01:00Z', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'transition', 'payment_captured', 'pi_unknown', null, null, null
  );
  if result ->> 'outcome' <> 'unknown_order'
     or exists (select 1 from public.research_provider_webhook_events
                 where provider_name = 'stripe' and event_id = 'evt_unknown_order') then
    raise exception 'verification: unknown order was claimed: %', result;
  end if;

  result := public.research_commerce_webhook_claim_and_apply_v1(
    'stripe', 'evt_reference_conflict', 'payment.captured', repeat('d', 64),
    '2026-08-28T09:01:01Z', '33333333-3333-4333-8333-333333333333',
    'transition', 'payment_captured', 'pi_conflicting', null, null, null
  );
  if result ->> 'outcome' <> 'conflict'
     or exists (select 1 from public.research_provider_webhook_events
                 where provider_name = 'stripe' and event_id = 'evt_reference_conflict')
     or not exists (select 1 from public.research_orders
                     where id = '33333333-3333-4333-8333-333333333333'
                       and state = 'approved' and payment_reference = 'pi_expected') then
    raise exception 'verification: provider-reference conflict mutated or claimed: %', result;
  end if;

  -- The shared last_idempotency_key deliberately equals the provider event id.
  -- It is not replay authority; the absent payload-bound inbox is authoritative.
  result := public.research_commerce_webhook_claim_and_apply_v1(
    'stripe', 'evt_early_capture', 'payment.captured', repeat('e', 64),
    '2026-08-28T09:01:02Z', '22222222-2222-4222-8222-222222222222',
    'transition', 'payment_captured', 'pi_early', null, null, null
  );
  if result ->> 'outcome' <> 'retryable'
     or exists (select 1 from public.research_provider_webhook_events
                 where provider_name = 'stripe' and event_id = 'evt_early_capture') then
    raise exception 'verification: early capture or shared-key collision was falsely claimed: %', result;
  end if;
  update public.research_orders set state = 'approved'
   where id = '22222222-2222-4222-8222-222222222222';
  result := public.research_commerce_webhook_claim_and_apply_v1(
    'stripe', 'evt_early_capture', 'payment.captured', repeat('e', 64),
    '2026-08-28T09:01:03Z', '22222222-2222-4222-8222-222222222222',
    'transition', 'payment_captured', 'pi_early', null, null, null
  );
  if result ->> 'outcome' <> 'applied'
     or not exists (select 1 from public.research_orders
                     where id = '22222222-2222-4222-8222-222222222222'
                       and state = 'payment_captured'
                       and last_idempotency_key = 'evt_early_capture') then
    raise exception 'verification: early capture did not apply after approval: %', result;
  end if;
end
$non_claiming_refusals$;

do $fulfillment_and_permanent_ack$
declare
  result jsonb;
begin
  result := public.research_commerce_webhook_claim_and_apply_v1(
    'mitch', 'evt_delivery_early', 'delivered', repeat('f', 64),
    '2026-08-28T09:02:00Z', '44444444-4444-4444-8444-444444444444',
    'transition', 'delivered', null, 'delivered', '1Z-ATOMIC', 'ups'
  );
  if result ->> 'outcome' <> 'retryable'
     or exists (select 1 from public.research_provider_webhook_events
                 where provider_name = 'mitch' and event_id = 'evt_delivery_early') then
    raise exception 'verification: early delivery was claimed: %', result;
  end if;
  update public.research_orders set state = 'fulfilled'
   where id = '44444444-4444-4444-8444-444444444444';
  result := public.research_commerce_webhook_claim_and_apply_v1(
    'mitch', 'evt_delivery_early', 'delivered', repeat('f', 64),
    '2026-08-28T09:02:01Z', '44444444-4444-4444-8444-444444444444',
    'transition', 'delivered', null, 'delivered', '1Z-ATOMIC', 'ups'
  );
  if result ->> 'outcome' <> 'applied'
     or not exists (select 1 from public.research_orders
                     where id = '44444444-4444-4444-8444-444444444444'
                       and state = 'delivered')
     or not exists (select 1 from public.research_order_shipments
                     where order_id = '44444444-4444-4444-8444-444444444444'
                       and status = 'delivered' and tracking_number = '1Z-ATOMIC'
                       and carrier = 'ups')
     or (select count(*) from public.research_order_state_events
          where order_id = '44444444-4444-4444-8444-444444444444'
            and idempotency_key = 'evt_delivery_early') <> 1 then
    raise exception 'verification: delivery state/shipment facts did not commit together: %', result;
  end if;

  result := public.research_commerce_webhook_claim_and_apply_v1(
    'mitch', 'evt_no_shipment', 'delivered', repeat('1', 64),
    '2026-08-28T09:02:02Z', '55555555-5555-4555-8555-555555555555',
    'transition', 'delivered', null, 'delivered', 'NO-ROW', 'ups'
  );
  if result ->> 'outcome' <> 'capability_disabled'
     or exists (select 1 from public.research_provider_webhook_events
                 where provider_name = 'mitch' and event_id = 'evt_no_shipment')
     or not exists (select 1 from public.research_orders
                     where id = '55555555-5555-4555-8555-555555555555'
                       and state = 'fulfilled') then
    raise exception 'verification: incomplete shipment projection did not fail closed: %', result;
  end if;

  -- Refund is permanently actor-forbidden to provider_webhook in the published
  -- transition table. Acknowledging it prevents a permanent retry storm.
  result := public.research_commerce_webhook_claim_and_apply_v1(
    'stripe', 'evt_forbidden_refund', 'payment.refunded', repeat('2', 64),
    '2026-08-28T09:02:03Z', '66666666-6666-4666-8666-666666666666',
    'transition', 'refunded', 'pi_refund', null, null, null
  );
  if result ->> 'outcome' <> 'acknowledged'
     or not exists (select 1 from public.research_orders
                     where id = '66666666-6666-4666-8666-666666666666'
                       and state = 'payment_captured') then
    raise exception 'verification: actor-forbidden refund was not a permanent no-op: %', result;
  end if;
  result := public.research_commerce_webhook_claim_and_apply_v1(
    'stripe', 'evt_forbidden_refund', 'payment.refunded', repeat('2', 64),
    '2026-08-28T09:02:04Z', '66666666-6666-4666-8666-666666666666',
    'transition', 'refunded', 'pi_refund', null, null, null
  );
  if result ->> 'outcome' <> 'duplicate' then
    raise exception 'verification: permanent no-op replay was not duplicate: %', result;
  end if;
end
$fulfillment_and_permanent_ack$;

create function public.verification_injected_state_event_crash()
returns trigger
language plpgsql
set search_path = pg_catalog
as $verification_injected_state_event_crash$
begin
  if new.idempotency_key = 'evt_crash' then
    raise exception 'verification injected crash';
  end if;
  return new;
end
$verification_injected_state_event_crash$;

create trigger verification_injected_state_event_crash
  before insert on public.research_order_state_events
  for each row execute function public.verification_injected_state_event_crash();

do $crash_rollback$
declare
  result jsonb;
begin
  begin
    result := public.research_commerce_webhook_claim_and_apply_v1(
      'stripe', 'evt_crash', 'payment.captured', repeat('3', 64),
      '2026-08-28T09:03:00Z', '88888888-8888-4888-8888-888888888888',
      'transition', 'payment_captured', 'pi_crash', null, null, null
    );
    raise exception 'verification RPC unexpectedly survived crash trigger: %', result;
  exception when raise_exception then
    if sqlerrm <> 'verification injected crash' then
      raise;
    end if;
  end;

  if not exists (select 1 from public.research_orders
                  where id = '88888888-8888-4888-8888-888888888888'
                    and state = 'approved' and last_idempotency_key = 'admin-approved')
     or exists (select 1 from public.research_order_state_events
                 where idempotency_key = 'evt_crash')
     or exists (select 1 from public.research_provider_webhook_events
                 where provider_name = 'stripe' and event_id = 'evt_crash') then
    raise exception 'verification: injected crash leaked a partial transaction';
  end if;
end
$crash_rollback$;

drop trigger verification_injected_state_event_crash on public.research_order_state_events;
drop function public.verification_injected_state_event_crash();

do $crash_retry$
declare
  result jsonb;
begin
  result := public.research_commerce_webhook_claim_and_apply_v1(
    'stripe', 'evt_crash', 'payment.captured', repeat('3', 64),
    '2026-08-28T09:03:01Z', '88888888-8888-4888-8888-888888888888',
    'transition', 'payment_captured', 'pi_crash', null, null, null
  );
  if result ->> 'outcome' <> 'applied' then
    raise exception 'verification: crash retry did not apply: %', result;
  end if;
end
$crash_retry$;

-- The service role can execute the definer RPC but cannot directly forge inbox
-- claims. Browser roles have neither table access nor routine execution.
set role service_role;
do $service_role_boundary$
declare
  result jsonb;
begin
  result := public.research_commerce_webhook_claim_and_apply_v1(
    'stripe', 'evt_ack', 'payment.future', repeat('4', 64),
    '2026-08-28T09:04:00Z', null,
    'acknowledge', null, null, null, null, null
  );
  if result is distinct from pg_catalog.jsonb_build_object(
    'capability', 'research_commerce_webhook_atomic_apply/v1',
    'providerName', 'stripe', 'eventId', 'evt_ack',
    'payloadSha256', repeat('4', 64), 'outcome', 'acknowledged'
  ) then
    raise exception 'verification: service-role exact attestation mismatch: %', result;
  end if;
  begin
    insert into public.research_provider_webhook_events (
      provider_name, event_id, event_type, received_at
    ) values ('forged', 'forged', 'forged', now());
    raise exception 'verification: service_role forged a direct inbox row';
  exception when insufficient_privilege then
    null;
  end;
end
$service_role_boundary$;
reset role;

do $acl_and_immutability$
begin
  if pg_catalog.has_function_privilege(
       'anon',
       'public.research_commerce_webhook_claim_and_apply_v1(text,text,text,text,timestamp with time zone,text,text,text,text,text,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.research_commerce_webhook_claim_and_apply_v1(text,text,text,text,timestamp with time zone,text,text,text,text,text,text,text)',
       'EXECUTE'
     ) then
    raise exception 'verification: browser role can execute atomic RPC';
  end if;
  begin
    update public.research_provider_webhook_events
       set event_type = 'mutated'
     where provider_name = 'stripe' and event_id = 'evt_ack';
    raise exception 'verification: immutable inbox accepted update';
  exception when sqlstate '55000' then
    null;
  end;
  begin
    delete from public.research_provider_webhook_events
     where provider_name = 'stripe' and event_id = 'evt_ack';
    raise exception 'verification: immutable inbox accepted delete';
  exception when sqlstate '55000' then
    null;
  end;
end
$acl_and_immutability$;
