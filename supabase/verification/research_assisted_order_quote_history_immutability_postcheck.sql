-- PII-free read-only qualification. Run only on an explicitly authorized
-- target. No row ids, customer addresses, evidence refs or provider ids leave DB.
begin transaction read only;
with facts as (
  select r.status,
    exists (select 1 from public.research_assisted_order_events e
      where e.request_id = r.id and e.status = 'paid') as has_paid_history,
    exists (select 1 from public.research_assisted_order_payment_verifications v
      join public.research_assisted_order_quotes q on q.id = v.quote_id
      where v.request_id = r.id and q.request_id = r.id and q.state = 'accepted'
        and q.acceptance_id = v.acceptance_id and q.version = v.quote_version
        and q.total_cents = v.observed_amount_cents and q.currency = v.observed_currency) as payment_verified,
    exists (select 1 from public.research_assisted_order_quotes q
      where q.request_id = r.id and q.state = 'accepted') as accepted_quote
  from public.research_assisted_order_requests r
)
select json_build_object(
  'requests', count(*),
  'unverified_current_paid', count(*) filter (where status = 'paid' and not payment_verified),
  'unverified_current_post_paid', count(*) filter (where status in ('supplier_processing','shipped','delivered','closed') and not payment_verified),
  'unverified_paid_history_any_status', count(*) filter (where has_paid_history and not payment_verified),
  'historical_progression_holds', count(*) filter (where (status in ('paid','supplier_processing','shipped','delivered','closed') or has_paid_history) and not payment_verified),
  'verified_requests', count(*) filter (where payment_verified),
  'payment_workflow_without_accepted_quote', count(*) filter (where status in ('payment_pending','payment_review') and not accepted_quote),
  'provider_observations', (select count(*) from public.research_assisted_order_payment_observations where method = 'provider'),
  'unverified_provider_observations', (select count(*) from public.research_assisted_order_payment_observations o
    where o.method = 'provider' and not exists (select 1 from public.research_assisted_order_payment_verifications v where v.observation_id = o.id)),
  'provider_verifications', (select count(*) from public.research_assisted_order_payment_verifications where method = 'provider'),
  'manual_observations_without_actor_uuid', (select count(*) from public.research_assisted_order_payment_observations
    where method = 'manual' and observed_by_auth_user_id is null),
  'accepted_quotes', (select count(*) from public.research_assisted_order_quotes where state = 'accepted')
)::text
from facts;
-- Expected: all installed=true, all private=true and public RPC ACLs exact.
select json_build_object(
  'historical_progression_guard', exists (select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.research_assisted_order_requests'::regclass
      and tgname = 'hl12_history_progression' and tgenabled <> 'D'),
  'quote_snapshot_guard', exists (select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.research_assisted_order_quotes'::regclass
      and tgname = 'hl12_quote_snapshot_immutable' and tgenabled <> 'D'),
  'quote_truncate_guard', exists (select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.research_assisted_order_quotes'::regclass
      and tgname = 'hl12_quote_snapshot_no_truncate' and tgenabled <> 'D'),
  'provider_observation_hold', exists (select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.research_assisted_order_payment_observations'::regclass
      and tgname = 'hl12_provider_observation_hold' and tgenabled <> 'D'),
  'provider_verification_hold', exists (select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.research_assisted_order_payment_verifications'::regclass
      and tgname = 'hl12_provider_verification_hold' and tgenabled <> 'D'),
  'unbound_verifier_private', not has_function_privilege('service_role','public.research_assisted_order_payment_verify(uuid,uuid)','EXECUTE'),
  'service_quote_accept', has_function_privilege('service_role','public.research_assisted_order_quote_accept(uuid,integer,bigint,uuid,text,text)','EXECUTE'),
  'anonymous_quote_accept_private', not has_function_privilege('anon','public.research_assisted_order_quote_accept(uuid,integer,bigint,uuid,text,text)','EXECUTE'),
  'authenticated_quote_accept_private', not has_function_privilege('authenticated','public.research_assisted_order_quote_accept(uuid,integer,bigint,uuid,text,text)','EXECUTE')
)::text;
-- Record exact effective function fingerprints alongside source checksums.
select json_object_agg(p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid)))::text
from pg_catalog.pg_proc p
where p.oid in (
  'public.research_assisted_order_quote_accept(uuid,integer,bigint,uuid,text,text)'::regprocedure,
  'public.research_assisted_order_history_progression_guard()'::regprocedure,
  'public.research_assisted_order_quote_snapshot_guard()'::regprocedure,
  'public.research_assisted_order_payment_observe(uuid,uuid,text,bigint,text,text,text,timestamptz,uuid,text,text,text)'::regprocedure,
  'public.research_assisted_order_payment_verify_bound(uuid,uuid,uuid)'::regprocedure
);
rollback;
