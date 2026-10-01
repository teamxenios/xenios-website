-- After 234614 is applied on top of the observation_only fixture.
\set ON_ERROR_STOP off
\pset pager off
select id as obs from public.research_assisted_order_payment_observations where method = 'provider' limit 1 \gset
select id as qid from public.research_assisted_order_quotes where request_id = 'dddddddd-0000-4000-8000-000000000001' limit 1 \gset
set role service_role;
\echo '=== H-a verify_bound the PRE-HOLD provider observation'
select public.research_assisted_order_payment_verify_bound('dddddddd-0000-4000-8000-000000000001', :'obs'::uuid, null);
\echo '=== H-b new forged provider observation'
select public.research_assisted_order_payment_observe('dddddddd-0000-4000-8000-000000000001', :'qid'::uuid, 'provider', 10000, 'USD',
  'pi_post_hold', 'post-hold-evidence', now(), null, 'anything', 'evt_post_hold', 'pi_post_hold');
\echo '=== H-c verify_bound with NULL request id (SQL-10)'
select public.research_assisted_order_payment_verify_bound(null, :'obs'::uuid, null) is null as null_request_refused;
\echo '=== H-d direct unbound verify as service_role'
select public.research_assisted_order_payment_verify(:'obs'::uuid, null);
reset role;
\echo '=== H-e owner-role direct insert of a provider verification (trigger)'
insert into public.research_assisted_order_payment_verifications (request_id, quote_id, quote_version, acceptance_id, observation_id,
  expected_amount_cents, expected_currency, observed_amount_cents, observed_currency, payment_reference, method, provider_name,
  provider_event_id, provider_payment_id, verified_by)
select o.request_id, q.id, q.version, q.acceptance_id, o.id, q.total_cents, q.currency, o.observed_amount_cents, o.observed_currency,
  o.payment_reference, 'provider', o.provider_name, o.provider_event_id, o.provider_payment_id, 'provider:anything'
from public.research_assisted_order_payment_observations o join public.research_assisted_order_quotes q on q.id = o.quote_id where o.id = :'obs';
select status as request_status, (select count(*) from public.research_assisted_order_payment_verifications) as verifications
from public.research_assisted_order_requests where id = 'dddddddd-0000-4000-8000-000000000001';
\echo '=== H-f cancel the request that holds only a stranded provider observation (N2 liveness)'
set role service_role;
select public.research_assisted_order_set_status('dddddddd-0000-4000-8000-000000000001','payment_review','cancelled','ops','admin',
  'customer withdrew', null, jsonb_build_object('cancellationReason','customer withdrew'), now()) is not null as cancelled;
reset role;
