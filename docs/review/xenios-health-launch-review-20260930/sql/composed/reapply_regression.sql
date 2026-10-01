\set ON_ERROR_STOP off
\pset pager off
-- After 202413 is re-applied on top of 230541: does AUTH-01 return?
select public.research_assisted_order_submit(jsonb_build_object(
  'requestId', 'cccccccc-0000-4000-8000-000000000001', 'publicReference', 'XRR-20260930-FC00000001',
  'idempotencyKeyHash', 'h-reapply', 'requestFingerprint', 'fp-reapply', 'earlyAccessSessionHash', repeat('c',64),
  'normalizedEmail', 'guest@example.invalid', 'fullLegalName', 'Guest Customer', 'mobilePhone', '+15125550100',
  'shippingAddress', jsonb_build_object('line1','1 Test','city','Austin','region','TX','postalCode','78704','countryCode','US'),
  'billingAddress', jsonb_build_object('line1','1 Test','city','Austin','region','TX','postalCode','78704','countryCode','US'),
  'ageConfirmed', true, 'agreements', '[]'::jsonb, 'estimatedTotalCents', 10000, 'currency', 'USD',
  'source', 'early_access_manual_order_bridge', 'statusTokenHash', repeat('d',64), 'createdAt', now()::text,
  'lines', jsonb_build_array(jsonb_build_object('lineId', gen_random_uuid(), 'productId','pc-prod-1','variantId','pc-var-1',
    'productName','BPC-157','quantity',2,'minimumQuantity',1,'quantityIncrement',1,'workflowMode','direct_order_request',
    'customerActionLabel','Request order','unitPriceCents',5000,'lineEstimateCents',10000,'currency','USD',
    'catalogVersion','v1','authoritativeFingerprint','fp-line-reapply')))) is not null as submitted;
select (select jsonb_agg(jsonb_build_object('lineId', id)) from public.research_assisted_order_lines where request_id='cccccccc-0000-4000-8000-000000000001')::text as d \gset
set role service_role;
select public.research_assisted_order_set_status('cccccccc-0000-4000-8000-000000000001','submitted','reviewing','ops','admin') is not null as reviewing;
select (public.research_assisted_order_quote_issue('cccccccc-0000-4000-8000-000000000001', :'d'::jsonb, now() + interval '7 days', 'ops@example.invalid') ->> 'quoteId') as qid \gset
select public.research_assisted_order_quote_accept(:'qid'::uuid, 1, 10000, 'bbbbbbbb-0000-4000-8000-000000000009'::uuid, null, null) ->> 'acceptanceId' is not null as unrelated_member_accepted_after_reapply;
reset role;
