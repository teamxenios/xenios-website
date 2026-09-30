-- Claude HL-12 SQL probe (review-only, disposable container). Prints ACCEPTED/REFUSED per case.
\set ON_ERROR_STOP on
create or replace function pg_temp.try_status(p_id uuid, p_from text, p_to text, p_evidence jsonb, p_actor text default 'admin@example.invalid')
returns text language plpgsql as $$
begin
  perform public.research_assisted_order_set_status(p_id, p_from, p_to, p_actor, 'admin', null, null, p_evidence);
  return 'ACCEPTED';
exception when others then
  return 'REFUSED(' || sqlstate || ': ' || left(sqlerrm, 90) || ')';
end $$;

create or replace function pg_temp.new_request(p_ref text, p_total bigint) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  perform public.research_assisted_order_submit(jsonb_build_object(
    'requestId', v_id, 'publicReference', p_ref, 'idempotencyKeyHash', 'hash-' || p_ref,
    'requestFingerprint', 'fp-' || p_ref, 'earlyAccessSessionHash', repeat('a', 64),
    'normalizedEmail', 'probe@example.invalid', 'fullLegalName', 'Probe Customer', 'mobilePhone', '+15125550100',
    'shippingAddress', jsonb_build_object('line1','1 Test','city','Austin','region','TX','postalCode','78704','countryCode','US'),
    'billingAddress', jsonb_build_object('line1','1 Test','city','Austin','region','TX','postalCode','78704','countryCode','US'),
    'ageConfirmed', true, 'agreements', '[]'::jsonb, 'estimatedTotalCents', p_total, 'currency', 'USD',
    'source', 'early_access_manual_order_bridge', 'statusTokenHash', 'tok-' || p_ref, 'createdAt', now()::text,
    'lines', jsonb_build_array(jsonb_build_object('lineId', gen_random_uuid(), 'productId','pc-prod-1','variantId','pc-var-1',
      'productName','BPC-157','quantity',2,'minimumQuantity',1,'quantityIncrement',1,'workflowMode','direct_order_request',
      'customerActionLabel','Request order','unitPriceCents',p_total/2,'lineEstimateCents',p_total,'currency','USD',
      'catalogVersion','v1','authoritativeFingerprint','fp-line-' || p_ref))));
  perform pg_temp.try_status(v_id, 'submitted', 'reviewing', '{}');
  perform pg_temp.try_status(v_id, 'reviewing', 'payment_pending', '{}');
  perform pg_temp.try_status(v_id, 'payment_pending', 'payment_review', '{}');
  return v_id;
end $$;

\echo '=== HL-12 cases (request estimate 10000 USD; expected behaviour: only amount-bound authorized verification may reach paid) ==='
select 'C1 arbitrary non-empty text as verification id' as case_, pg_temp.try_status(pg_temp.new_request('XRR-20260930-ABCDEF0001',10000),'payment_review','paid','{"paymentVerificationId":"x"}') as result
union all select 'C2 whitespace-only verification id', pg_temp.try_status(pg_temp.new_request('XRR-20260930-ABCDEF0002',10000),'payment_review','paid','{"paymentVerificationId":"   "}')
union all select 'C3 wrong amount (1 cent vs 10000 estimate)', pg_temp.try_status(pg_temp.new_request('XRR-20260930-ABCDEF0003',10000),'payment_review','paid','{"paymentVerificationId":"bank-ref-1","verifiedAmountCents":1,"currency":"USD"}')
union all select 'C4 wrong currency (EUR)', pg_temp.try_status(pg_temp.new_request('XRR-20260930-ABCDEF0004',10000),'payment_review','paid','{"paymentVerificationId":"bank-ref-2","verifiedAmountCents":10000,"currency":"EUR"}')
union all select 'C5 actor id is free text (non-admin string)', pg_temp.try_status(pg_temp.new_request('XRR-20260930-ABCDEF0005',10000),'payment_review','paid','{"paymentVerificationId":"bank-ref-3"}','anonymous-customer');
\echo '=== replay and reuse ==='
do $$ declare a uuid := pg_temp.new_request('XRR-20260930-ABCDEF0006',10000); b uuid := pg_temp.new_request('XRR-20260930-ABCDEF0007',10000);
begin
  raise notice 'C6 same verification id on two different orders: first=% second=%',
    pg_temp.try_status(a,'payment_review','paid','{"paymentVerificationId":"bank-ref-SHARED"}'),
    pg_temp.try_status(b,'payment_review','paid','{"paymentVerificationId":"bank-ref-SHARED"}');
  raise notice 'C7 replayed paid transition on the same order: %', pg_temp.try_status(a,'payment_review','paid','{"paymentVerificationId":"bank-ref-SHARED"}');
  raise notice 'C8 cancel after paid without refund evidence: %', pg_temp.try_status(a,'paid','cancelled','{"cancellationReason":"x"}');
end $$;
\echo '=== grants on set_status ==='
select grantee, privilege_type from information_schema.routine_privileges
 where routine_name = 'research_assisted_order_set_status' and grantee in ('anon','authenticated','service_role','PUBLIC') order by 1;
\echo '=== columns recording an amount at paid ==='
select column_name from information_schema.columns where table_name = 'research_assisted_order_requests' and column_name ~ '(verified|paid|amount|quote)' order by 1;
