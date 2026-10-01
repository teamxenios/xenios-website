\set ON_ERROR_STOP off
\pset pager off
select id as qid from public.research_assisted_order_quotes where request_id = 'dddddddd-0000-4000-8000-000000000001' limit 1 \gset
select id as obs from public.research_assisted_order_payment_observations where method = 'provider' limit 1 \gset
select 'pi_reapply_' || substr(md5(random()::text), 1, 10) as pid \gset
set role service_role;
\echo '--- new forged provider observation'
select public.research_assisted_order_payment_observe('dddddddd-0000-4000-8000-000000000001', :'qid'::uuid, 'provider', 10000, 'USD',
  :'pid', 'ev-' || :'pid', now(), null, 'anything', 'evt-' || :'pid', :'pid') ->> 'observationId' as forged_observation;
\echo '--- verify_bound the stranded pre-hold provider observation'
select public.research_assisted_order_payment_verify_bound('dddddddd-0000-4000-8000-000000000001', :'obs'::uuid, null) ->> 'state' as state;
\echo '--- direct unbound verify (only meaningful if the grant came back)'
select public.research_assisted_order_payment_verify(:'obs'::uuid, null) ->> 'state' as unbound_state;
reset role;
select status as request_status from public.research_assisted_order_requests where id = 'dddddddd-0000-4000-8000-000000000001';
select has_function_privilege('service_role','public.research_assisted_order_payment_verify(uuid,uuid)','EXECUTE') as service_role_unbound_verify,
       position('coalesce(v_authorized' in (select prosrc from pg_proc where proname='research_assisted_order_quote_accept')) > 0 as quote_accept_null_safe,
       position('is distinct from p_request_id' in (select prosrc from pg_proc where proname='research_assisted_order_payment_verify_bound')) > 0 as verify_bound_null_safe;
