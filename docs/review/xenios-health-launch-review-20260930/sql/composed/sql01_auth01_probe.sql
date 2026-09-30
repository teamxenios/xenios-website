-- Claude review-only reproduction of HL12-SQL-01 (provider path, no payment-attempt binding)
-- and AUTH-01 (quote_accept three-valued authorization). Disposable database only.
-- Fixtures are created as the owner; every finance RPC runs as service_role, the server's role.
\set ON_ERROR_STOP off
\pset pager off

-- Fixture: a guest (early-access session) request: actor_member_id is NULL.
select public.research_assisted_order_submit(jsonb_build_object(
  'requestId', 'aaaaaaaa-0000-4000-8000-000000000001', 'publicReference', 'XRR-20260930-F000000001',
  'idempotencyKeyHash', 'h-sql01', 'requestFingerprint', 'fp-sql01', 'earlyAccessSessionHash', 'sess-guest-owner',
  'normalizedEmail', 'guest@example.invalid', 'fullLegalName', 'Guest Customer', 'mobilePhone', '+15125550100',
  'shippingAddress', jsonb_build_object('line1','1 Test','city','Austin','region','TX','postalCode','78704','countryCode','US'),
  'billingAddress', jsonb_build_object('line1','1 Test','city','Austin','region','TX','postalCode','78704','countryCode','US'),
  'ageConfirmed', true, 'agreements', '[]'::jsonb, 'estimatedTotalCents', 10000, 'currency', 'USD',
  'source', 'early_access_manual_order_bridge', 'statusTokenHash', repeat('b',64), 'createdAt', now()::text,
  'lines', jsonb_build_array(jsonb_build_object('lineId', gen_random_uuid(), 'productId','pc-prod-1','variantId','pc-var-1',
    'productName','BPC-157','quantity',2,'minimumQuantity',1,'quantityIncrement',1,'workflowMode','direct_order_request',
    'customerActionLabel','Request order','unitPriceCents',5000,'lineEstimateCents',10000,'currency','USD',
    'catalogVersion','v1','authoritativeFingerprint','fp-line-sql01')))) is not null as submitted;
select actor_member_id is null as guest_request, early_access_session_hash from public.research_assisted_order_requests where id='aaaaaaaa-0000-4000-8000-000000000001';
select (select jsonb_agg(jsonb_build_object('lineId', id)) from public.research_assisted_order_lines where request_id='aaaaaaaa-0000-4000-8000-000000000001')::text as line_decisions \gset

set role service_role;
select public.research_assisted_order_set_status('aaaaaaaa-0000-4000-8000-000000000001','submitted','reviewing','ops','admin') is not null as to_reviewing;
select (public.research_assisted_order_quote_issue('aaaaaaaa-0000-4000-8000-000000000001', :'line_decisions'::jsonb,
  now() + interval '7 days', 'ops@example.invalid') ->> 'quoteId') as quote_id \gset
\echo quote_id = :quote_id

\echo '=== AUTH-01 control: a wrong early-access session hash is refused (both sides non-null -> false) ==='
select public.research_assisted_order_quote_accept(:'quote_id'::uuid, 1, 10000, null, 'sess-attacker', null) as wrong_session_result;
\echo '=== AUTH-01: an UNRELATED member id, no session, no token, against the guest request ==='
select public.research_assisted_order_quote_accept(:'quote_id'::uuid, 1, 10000, 'bbbbbbbb-0000-4000-8000-000000000009'::uuid, null, null) as unrelated_member_result;
reset role;
select state as quote_state_after_unrelated_member from public.research_assisted_order_quotes where id = :'quote_id';

\echo '=== HL12-SQL-01: forged provider observation + verification; service_role only, no grant, no attempt, invented ids ==='
set role service_role;
select public.research_assisted_order_set_status('aaaaaaaa-0000-4000-8000-000000000001','reviewing','payment_pending','ops','admin') is not null as to_pending;
select public.research_assisted_order_set_status('aaaaaaaa-0000-4000-8000-000000000001','payment_pending','payment_review','ops','admin') is not null as to_review;
select (public.research_assisted_order_payment_observe('aaaaaaaa-0000-4000-8000-000000000001', :'quote_id'::uuid, 'provider', 10000, 'USD',
  'pi_forged_by_claude', 'no-real-evidence', now(), null, 'anything', 'evt_forged_by_claude', 'pi_forged_by_claude') ->> 'observationId') as obs_id \gset
\echo obs_id = :obs_id
select public.research_assisted_order_payment_verify_bound('aaaaaaaa-0000-4000-8000-000000000001', :'obs_id'::uuid, null) as verify_result;
reset role;
select status as request_status_after_forgery from public.research_assisted_order_requests where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select method, provider_name, provider_payment_id, observed_by from public.research_assisted_order_payment_observations where request_id='aaaaaaaa-0000-4000-8000-000000000001';
select count(*) as verifications from public.research_assisted_order_payment_verifications where request_id='aaaaaaaa-0000-4000-8000-000000000001';
select count(*) as verifier_grants_in_db from public.research_assisted_order_payment_verifier_grants;
