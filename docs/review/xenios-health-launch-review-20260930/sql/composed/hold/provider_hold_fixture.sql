-- Fixture for the 234614 provider-hold checks: one accepted guest request in payment_review,
-- plus a provider observation recorded by the PERMISSIVE 230541 observe (before the hold).
-- :mode = 'observation_only' or 'with_verification'.
\set ON_ERROR_STOP on
\pset pager off
select public.research_assisted_order_submit(jsonb_build_object(
  'requestId', 'dddddddd-0000-4000-8000-000000000001', 'publicReference', 'XRR-20260930-FD00000001',
  'idempotencyKeyHash', 'h-hold', 'requestFingerprint', 'fp-hold', 'earlyAccessSessionHash', repeat('e',64),
  'normalizedEmail', 'guest@example.invalid', 'fullLegalName', 'Guest Customer', 'mobilePhone', '+15125550100',
  'shippingAddress', jsonb_build_object('line1','1 Test','city','Austin','region','TX','postalCode','78704','countryCode','US'),
  'billingAddress', jsonb_build_object('line1','1 Test','city','Austin','region','TX','postalCode','78704','countryCode','US'),
  'ageConfirmed', true, 'agreements', '[]'::jsonb, 'estimatedTotalCents', 10000, 'currency', 'USD',
  'source', 'early_access_manual_order_bridge', 'statusTokenHash', repeat('f',64), 'createdAt', now()::text,
  'lines', jsonb_build_array(jsonb_build_object('lineId', gen_random_uuid(), 'productId','pc-prod-1','variantId','pc-var-1',
    'productName','BPC-157','quantity',2,'minimumQuantity',1,'quantityIncrement',1,'workflowMode','direct_order_request',
    'customerActionLabel','Request order','unitPriceCents',5000,'lineEstimateCents',10000,'currency','USD',
    'catalogVersion','v1','authoritativeFingerprint','fp-line-hold')))) is not null as submitted;
select (select jsonb_agg(jsonb_build_object('lineId', id)) from public.research_assisted_order_lines where request_id='dddddddd-0000-4000-8000-000000000001')::text as d \gset
set role service_role;
select public.research_assisted_order_set_status('dddddddd-0000-4000-8000-000000000001','submitted','reviewing','ops','admin') is not null as reviewing;
select (public.research_assisted_order_quote_issue('dddddddd-0000-4000-8000-000000000001', :'d'::jsonb, now() + interval '7 days', 'ops@example.invalid') ->> 'quoteId') as qid \gset
select public.research_assisted_order_quote_accept(:'qid'::uuid, 1, 10000, null, repeat('e',64), null) ->> 'acceptanceId' is not null as accepted;
select public.research_assisted_order_set_status('dddddddd-0000-4000-8000-000000000001','reviewing','payment_pending','ops','admin') is not null as pending;
select public.research_assisted_order_set_status('dddddddd-0000-4000-8000-000000000001','payment_pending','payment_review','ops','admin') is not null as review;
select (public.research_assisted_order_payment_observe('dddddddd-0000-4000-8000-000000000001', :'qid'::uuid, 'provider', 10000, 'USD',
  'pi_pre_hold', 'pre-hold-evidence', now(), null, 'anything', 'evt_pre_hold', 'pi_pre_hold') ->> 'observationId') as obs \gset
\if :{?mode}
\else
\set mode observation_only
\endif
select :'mode' = 'with_verification' as make_verification \gset
\if :make_verification
select public.research_assisted_order_payment_verify_bound('dddddddd-0000-4000-8000-000000000001', :'obs'::uuid, null) ->> 'state' as pre_hold_verify_state;
\endif
reset role;
select method, count(*) from public.research_assisted_order_payment_observations group by method;
select count(*) as provider_verifications from public.research_assisted_order_payment_verifications where method = 'provider';
