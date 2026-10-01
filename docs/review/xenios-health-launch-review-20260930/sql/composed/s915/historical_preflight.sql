-- Claude-proposed HL-12 historical-paid preflight. Read-only, aggregate, PII-free (no email, name, address,
-- reference or evidence values). Run only under an authorized bounded managed read.
\pset pager off

-- PRE-APPLY: uses only M71 objects, so it runs before migrations 80-86 exist.
-- Every row counted in frozen_after_86 will be held by migration 86 (no verification can exist yet).
select r.status,
       count(*) as requests,
       count(*) filter (where exists (select 1 from public.research_assisted_order_events e
                                      where e.request_id = r.id and e.status = 'paid')) as with_paid_event,
       count(*) filter (where r.status in ('paid','supplier_processing','shipped','delivered','closed')
                           or exists (select 1 from public.research_assisted_order_events e
                                      where e.request_id = r.id and e.status = 'paid')) as frozen_after_86,
       count(*) filter (where r.status in ('payment_pending','payment_review')) as unquotable_payment_stage,
       min(r.updated_at)::date as oldest_update, max(r.updated_at)::date as newest_update
from public.research_assisted_order_requests r
group by r.status
order by r.status;

-- POST-APPLY: after 80-86, the same population measured against actual verification evidence,
-- plus the observation classes that can strand an order (N2) and payment-stage rows HIST-02 cannot quote.
select r.status, count(*) as held_without_verification
from public.research_assisted_order_requests r
where (r.status in ('paid','supplier_processing','shipped','delivered','closed')
       or exists (select 1 from public.research_assisted_order_events e where e.request_id = r.id and e.status = 'paid'))
  and coalesce((public.research_assisted_order_financial_state(r.id) ->> 'paymentVerified')::boolean, false) is not true
group by r.status order by r.status;

select o.method,
       count(*) as observations,
       count(*) filter (where o.observed_by_auth_user_id is null) as without_observer_uuid,
       count(*) filter (where not exists (select 1 from public.research_assisted_order_payment_verifications v
                                          where v.observation_id = o.id)) as unverified,
       count(distinct o.request_id) as requests_blocked_from_cancel
from public.research_assisted_order_payment_observations o
group by o.method order by o.method;

select count(*) as payment_stage_without_accepted_quote
from public.research_assisted_order_requests r
where r.status in ('payment_pending','payment_review')
  and not exists (select 1 from public.research_assisted_order_quotes q
                  where q.request_id = r.id and q.state = 'accepted');
