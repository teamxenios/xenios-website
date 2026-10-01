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
rollback;
