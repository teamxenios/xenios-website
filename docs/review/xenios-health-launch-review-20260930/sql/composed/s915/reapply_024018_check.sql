-- Run after each re-apply. Creates fresh fixtures each time (suffix :sfx), then probes.
\set ON_ERROR_STOP off
\pset pager off
select ('eeeeeeee-0000-4000-8000-0000000000' || :'sfx')::uuid as gid, ('ffffffff-0000-4000-8000-0000000000' || :'sfx')::uuid as cid \gset
-- guest request with an issued quote (AUTH-01 probe)
select public.research_assisted_order_submit(jsonb_build_object(
  'requestId', :'gid', 'publicReference', 'XRR-20261001-FE000000' || :'sfx',
  'idempotencyKeyHash', 'h-g-' || :'sfx', 'requestFingerprint', 'fp-g-' || :'sfx', 'earlyAccessSessionHash', repeat('a',64),
  'normalizedEmail', 'guest@example.invalid', 'fullLegalName', 'Guest Customer', 'mobilePhone', '+15125550100',
  'shippingAddress', jsonb_build_object('line1','1 Test','city','Austin','region','TX','postalCode','78704','countryCode','US'),
  'billingAddress', jsonb_build_object('line1','1 Test','city','Austin','region','TX','postalCode','78704','countryCode','US'),
  'ageConfirmed', true, 'agreements', '[]'::jsonb, 'estimatedTotalCents', 10000, 'currency', 'USD',
  'source', 'early_access_manual_order_bridge', 'statusTokenHash', repeat('b',64), 'createdAt', now()::text,
  'lines', jsonb_build_array(jsonb_build_object('lineId', gen_random_uuid(), 'productId','pc-prod-1','variantId','pc-var-1',
    'productName','BPC-157','quantity',2,'minimumQuantity',1,'quantityIncrement',1,'workflowMode','direct_order_request',
    'customerActionLabel','Request order','unitPriceCents',5000,'lineEstimateCents',10000,'currency','USD',
    'catalogVersion','v1','authoritativeFingerprint','fp-l-g-' || :'sfx')))) is not null as guest_submitted;
-- member request, quoted then cancelled (SQL-13 / acceptance backstop probe)
select public.research_assisted_order_submit(jsonb_build_object(
  'requestId', :'cid', 'publicReference', 'XRR-20261001-FF000000' || :'sfx', 'actorMemberId', '11111111-0000-4000-8000-000000000001',
  'idempotencyKeyHash', 'h-c-' || :'sfx', 'requestFingerprint', 'fp-c-' || :'sfx',
  'normalizedEmail', 'member@example.invalid', 'fullLegalName', 'Member Customer', 'mobilePhone', '+15125550100',
  'shippingAddress', jsonb_build_object('line1','1 Test','city','Austin','region','TX','postalCode','78704','countryCode','US'),
  'billingAddress', jsonb_build_object('line1','1 Test','city','Austin','region','TX','postalCode','78704','countryCode','US'),
  'ageConfirmed', true, 'agreements', '[]'::jsonb, 'estimatedTotalCents', 10000, 'currency', 'USD',
  'source', 'early_access_manual_order_bridge', 'statusTokenHash', repeat('c',64), 'createdAt', now()::text,
  'lines', jsonb_build_array(jsonb_build_object('lineId', gen_random_uuid(), 'productId','pc-prod-1','variantId','pc-var-1',
    'productName','BPC-157','quantity',2,'minimumQuantity',1,'quantityIncrement',1,'workflowMode','direct_order_request',
    'customerActionLabel','Request order','unitPriceCents',5000,'lineEstimateCents',10000,'currency','USD',
    'catalogVersion','v1','authoritativeFingerprint','fp-l-c-' || :'sfx')))) is not null as member_submitted;
select (select jsonb_agg(jsonb_build_object('lineId', id)) from public.research_assisted_order_lines where request_id=:'gid')::text as gd,
       (select jsonb_agg(jsonb_build_object('lineId', id)) from public.research_assisted_order_lines where request_id=:'cid')::text as cd \gset
set role service_role;
select public.research_assisted_order_set_status(:'gid','submitted','reviewing','ops','admin') is not null as g_reviewing;
select (public.research_assisted_order_quote_issue(:'gid', :'gd'::jsonb, now() + interval '7 days', 'ops@example.invalid') ->> 'quoteId') as gq \gset
select public.research_assisted_order_set_status(:'cid','submitted','reviewing','ops','admin') is not null as c_reviewing;
select (public.research_assisted_order_quote_issue(:'cid', :'cd'::jsonb, now() + interval '7 days', 'ops@example.invalid') ->> 'quoteId') as cq \gset
select public.research_assisted_order_set_status(:'cid','reviewing','cancelled','ops','admin','withdrawn',null,jsonb_build_object('cancellationReason','withdrawn'),now()) is not null as c_cancelled;
\echo '--- AUTH-01: unrelated member accepts the guest quote'
select coalesce(public.research_assisted_order_quote_accept(:'gq'::uuid, 1, 10000, '99999999-0000-4000-8000-000000000009'::uuid, null, null) ->> 'acceptanceId', 'NULL (refused)') as unrelated_member;
\echo '--- SQL-13: owner accepts the issued quote on the CANCELLED request'
select coalesce(public.research_assisted_order_quote_accept(:'cq'::uuid, 1, 10000, '11111111-0000-4000-8000-000000000001'::uuid, null, null) ->> 'acceptanceId', 'NULL') as accept_on_cancelled;
reset role;
\echo '--- trigger and function-body state'
select (select count(*) from pg_trigger where tgname in ('hl12_history_progression','hl12_quote_snapshot_immutable','hl12_quote_snapshot_no_truncate','hl12_provider_observation_hold','hl12_provider_verification_hold','hl12_observed_cancel','hl12_evidence_claim') and tgenabled <> 'D') as hl12_triggers_enabled,
       position('coalesce(v_authorized' in (select prosrc from pg_proc where proname='research_assisted_order_quote_accept')) > 0 as accept_null_safe,
       position('ACCEPTANCE_CLOSED' in (select prosrc from pg_proc where proname='research_assisted_order_quote_accept')) > 0 as accept_status_check,
       position('is distinct from p_request_id' in (select prosrc from pg_proc where proname='research_assisted_order_payment_verify_bound')) > 0 as verify_bound_null_safe,
       position('PROVIDER_AUTHORITY_NOT_READY' in (select prosrc from pg_proc where proname='research_assisted_order_payment_observe')) > 0 as observe_provider_refusal,
       has_function_privilege('service_role','public.research_assisted_order_payment_verify(uuid,uuid)','EXECUTE') as service_role_unbound_verify;
