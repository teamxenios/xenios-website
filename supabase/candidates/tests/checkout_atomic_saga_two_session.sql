\set ON_ERROR_STOP on
create extension dblink;

create function public.test_checkout_key_hash(p_member uuid, p_key text)
returns text language sql immutable as $$
  select encode(extensions.digest(convert_to(
    public.research_checkout_canonical_json_v1(jsonb_build_array('checkout-key', p_member::text, p_key)),
    'UTF8'), 'sha256'), 'hex')
$$;

create function public.test_checkout_command(
  p_member uuid, p_key text, p_intent uuid, p_cart uuid,
  p_command uuid, p_order uuid, p_credit bigint
) returns jsonb language plpgsql stable as $$
declare v_protocol text := 'xenios:research-checkout-saga:v1'; v_hash text;
begin
  v_hash := public.test_checkout_key_hash(p_member,p_key);
  return jsonb_build_object(
    'protocol',v_protocol,
    'commandId',p_command,
    'orderId',p_order,
    'memberId',p_member,
    'checkoutIdempotencyKey',p_key,
    'checkoutIdempotencyKeyHash',v_hash,
    'providerAuthorizationKey','xr_checkout_authorize_v1_' || encode(extensions.digest(convert_to(public.research_checkout_canonical_json_v1(jsonb_build_array(v_protocol,'authorize',p_command::text)),'UTF8'),'sha256'),'hex'),
    'providerCaptureKey','xr_checkout_capture_v1_' || encode(extensions.digest(convert_to(public.research_checkout_canonical_json_v1(jsonb_build_array(v_protocol,'capture',p_command::text)),'UTF8'),'sha256'),'hex'),
    'providerCancellationKey','xr_checkout_cancel_v1_' || encode(extensions.digest(convert_to(public.research_checkout_canonical_json_v1(jsonb_build_array(v_protocol,'cancel',p_command::text)),'UTF8'),'sha256'),'hex'),
    'placedAt','2026-08-28T10:00:00.000Z',
    'request',jsonb_build_object(
      'shippingAddress',jsonb_build_object('line1','100 Main St','city','Houston','state','TX','postalCode','77002','country','US'),
      'shippingService','standard','acceptedAgreementKeys',jsonb_build_array('XR-COM-001'),
      'researchAttestation',true,'applyStoreCreditCents',p_credit,'paymentMethodReference','pm_test_atomic'
    ),
    'activation',jsonb_build_object(
      'intentId',p_intent,'cartId',p_cart,'cartVersion',1,
      'cartFingerprint','sha256:' || repeat('a',64),
      'lines',jsonb_build_array(jsonb_build_object(
        'productId','44444444-4444-4444-8444-444444444444','variantId','55555555-5555-4555-8555-555555555555',
        'sku','XR-ATOM-1','productRevision',1,'variantRevision',1,
        'bindingFingerprint','sha256:' || repeat('a',64),'activationLedgerRevision',1,
        'activationEvidenceFingerprint','sha256:' || repeat('a',64),
        'quantity',1,'purchaseMode','one_time'
      )),
      'authorizedAt','2026-08-28T10:00:00.000Z','expiresAt','2099-08-28T10:30:00.000Z'
    ),
    'cart',jsonb_build_object(
      'lines',jsonb_build_array(jsonb_build_object(
        'sku','XR-ATOM-1','displayName','Atomic Product','quantity',1,'purchaseMode','one_time',
        'unitPriceCents',10000,'lineTotalCents',10000,'blockedReason',null
      )),
      'shipmentGroups',jsonb_build_array(jsonb_build_object('owner','xenios','skus',jsonb_build_array('XR-ATOM-1'))),
      'subtotalCents',10000,'shippingCents',1295,'storeCreditAppliedCents',p_credit,
      'estimatedTotalCents',11295-p_credit,'checkoutReady',true,
      'blockingReasons','[]'::jsonb,'requiredAgreements',jsonb_build_array('XR-COM-001')
    ),
    'shippingQuote',jsonb_build_object(
      'kind','configured_fallback','service','standard','amountCents',1295,
      'estimatedDeliveryRange',null,'disclosure','Configured rate'
    ),
    'totals',jsonb_build_object(
      'currency','usd','subtotalCents',10000,'shippingCents',1295,
      'storeCreditAppliedCents',p_credit,'totalCents',11295-p_credit
    ),
    'reviewTriggers','[]'::jsonb
  );
end $$;

create function public.test_insert_activation(p_member uuid,p_key text,p_intent uuid,p_cart uuid)
returns void language plpgsql as $$
begin
  insert into public.research_checkout_activation_intents(
    id,member_id,checkout_idempotency_key_hash,cart_id,cart_version,cart_fingerprint,
    authorization_digest,state,authorized_at,expires_at
  ) values (
    p_intent,p_member,public.test_checkout_key_hash(p_member,p_key),p_cart,1,
    'sha256:'||repeat('a',64),'sha256:'||repeat('b',64),'authorized',
    '2026-08-28T10:00:00.000Z','2099-08-28T10:30:00.000Z'
  );
  insert into public.research_checkout_activation_intent_lines(
    intent_id,ordinal,product_id,variant_id,sku,quantity,purchase_mode,
    product_revision,variant_revision,binding_fingerprint,
    activation_ledger_revision,activation_evidence_fingerprint
  ) values (
    p_intent,0,'44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555',
    'XR-ATOM-1',1,'one_time',1,1,'sha256:'||repeat('a',64),1,'sha256:'||repeat('a',64)
  );
end $$;

\o /dev/null

-- Two real backend sessions race for one 800-cent balance. The shared member
-- advisory lock plus durable holds must allow exactly one command to begin.
insert into public.research_store_credit_ledger values(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
  800,'approved','service_recovery','2026-08-01',null,'system',null,'2026-08-01',null
);
select public.test_insert_activation('11111111-1111-4111-8111-111111111111','credit-a','21111111-1111-4111-8111-111111111111','31111111-1111-4111-8111-111111111111');
select public.test_insert_activation('11111111-1111-4111-8111-111111111111','credit-b','22111111-1111-4111-8111-111111111111','32111111-1111-4111-8111-111111111111');

select dblink_connect('session_a','host=127.0.0.1 dbname=postgres user=postgres password=checkout-test-only');
select dblink_connect('session_b','host=127.0.0.1 dbname=postgres user=postgres password=checkout-test-only');
select dblink_send_query('session_a', format(
  'select public.research_checkout_command_begin_v1(%L::jsonb)',
  public.test_checkout_command(
    '11111111-1111-4111-8111-111111111111','credit-a','21111111-1111-4111-8111-111111111111',
    '31111111-1111-4111-8111-111111111111','41111111-1111-4111-8111-111111111111',
    '51111111-1111-4111-8111-111111111111',800
  )::text
));
select dblink_send_query('session_b', format(
  'select public.research_checkout_command_begin_v1(%L::jsonb)',
  public.test_checkout_command(
    '11111111-1111-4111-8111-111111111111','credit-b','22111111-1111-4111-8111-111111111111',
    '32111111-1111-4111-8111-111111111111','42111111-1111-4111-8111-111111111111',
    '52111111-1111-4111-8111-111111111111',800
  )::text
));
create temporary table race_results(result jsonb);
insert into race_results select result from dblink_get_result('session_a') as t(result jsonb);
insert into race_results select result from dblink_get_result('session_b') as t(result jsonb);
do $$ begin
  if (select count(*) from race_results where result->>'ok'='true') <> 1 then raise exception 'two-session hold race did not yield exactly one winner'; end if;
  if (select count(*) from race_results where result->>'code'='credit_unavailable') <> 1 then raise exception 'two-session hold race did not fail the loser closed'; end if;
  if (select count(*) from public.research_checkout_activation_intents where state='claimed') <> 1 then raise exception 'winning command was not claimed before provider I/O'; end if;
end $$;
select dblink_disconnect('session_a');
select dblink_disconnect('session_b');

-- A completion transaction that is rolled back must publish no partial order,
-- credit spend, reservation finalization, activation consume, or terminal state.
select public.test_insert_activation('61111111-1111-4111-8111-111111111111','rollback-case','62111111-1111-4111-8111-111111111111','63111111-1111-4111-8111-111111111111');
select public.research_checkout_command_begin_v1(public.test_checkout_command(
  '61111111-1111-4111-8111-111111111111','rollback-case','62111111-1111-4111-8111-111111111111',
  '63111111-1111-4111-8111-111111111111','64111111-1111-4111-8111-111111111111',
  '65111111-1111-4111-8111-111111111111',0
));
select public.research_checkout_command_record_authorization_v1(
  '64111111-1111-4111-8111-111111111111','pi_rollback',11295,'2026-08-28T10:00:01.000Z'
);
begin;
select public.research_checkout_command_complete_v1(
  '64111111-1111-4111-8111-111111111111','pi_rollback',11295,'2100-08-28T10:31:00.000Z'
);
do $$ begin
  if not exists(select 1 from public.research_orders where id='65111111-1111-4111-8111-111111111111') then raise exception 'completion did not publish inside transaction'; end if;
end $$;
rollback;
do $$ begin
  if exists(select 1 from public.research_orders where id='65111111-1111-4111-8111-111111111111') then raise exception 'order survived rollback'; end if;
  if (select state from public.research_checkout_commands where command_id='64111111-1111-4111-8111-111111111111') <> 'capture_pending' then raise exception 'command survived rollback'; end if;
  if (select state from public.research_checkout_activation_intents where id='62111111-1111-4111-8111-111111111111') <> 'claimed' then raise exception 'activation survived rollback'; end if;
  if exists(select 1 from public.test_inventory_reservations where member_id='61111111-1111-4111-8111-111111111111' and status<>'held') then raise exception 'inventory survived rollback'; end if;
end $$;

-- Same command completes after the original activation expiry because it was
-- claimed before provider I/O; this is recovery, not backdating.
select public.research_checkout_command_complete_v1(
  '64111111-1111-4111-8111-111111111111','pi_rollback',11295,'2100-08-28T10:31:00.000Z'
);
do $$ begin
  if (select state from public.research_checkout_commands where command_id='64111111-1111-4111-8111-111111111111') <> 'completed' then raise exception 'completion not durable'; end if;
  if (select state from public.research_checkout_activation_intents where id='62111111-1111-4111-8111-111111111111') <> 'consumed' then raise exception 'activation not consumed'; end if;
  if exists(select 1 from public.test_inventory_reservations where member_id='61111111-1111-4111-8111-111111111111' and status<>'finalized') then raise exception 'inventory not finalized'; end if;
  if (select count(*) from public.research_orders where id='65111111-1111-4111-8111-111111111111') <> 1 then raise exception 'order missing or duplicated'; end if;
end $$;

-- Client roles have no table or RPC authority.
do $$ begin
  if has_table_privilege('authenticated','public.research_checkout_commands','select') then raise exception 'authenticated table privilege leaked'; end if;
  if has_function_privilege('authenticated','public.research_checkout_command_begin_v1(jsonb)','execute') then raise exception 'authenticated RPC privilege leaked'; end if;
end $$;

\o
select 'checkout atomic saga two-session/rollback harness passed' as result;
