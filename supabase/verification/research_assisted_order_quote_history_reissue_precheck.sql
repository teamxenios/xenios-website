-- Read-only aggregate inventory after the exact predecessor chain, not on M71
-- alone. No row identities, payment references or customer data are emitted.
begin transaction read only;
set local lock_timeout='5s';
set local statement_timeout='15s';
with facts as (
  select r.status,
    exists (select 1 from public.research_assisted_order_quotes q where q.request_id=r.id and q.state='accepted') as accepted,
    exists (select 1 from public.research_assisted_order_payment_observations o where o.request_id=r.id) as observed,
    exists (select 1 from public.research_assisted_order_payment_verifications v where v.request_id=r.id) as verified,
    exists (select 1 from public.research_assisted_order_events e where e.request_id=r.id and e.status='paid') as paid_history,
    exists (select 1 from public.research_assisted_order_quotes q where q.request_id=r.id and q.state='issued' and q.valid_until<=now()) as expired_offer
  from public.research_assisted_order_requests r
)
select json_build_object(
  'requests',count(*),
  'payment_workflow_unencumbered',count(*) filter (where status in ('payment_pending','payment_review') and not (accepted or observed or verified or paid_history)),
  'expired_unaccepted_offer_unencumbered',count(*) filter (where status in ('payment_pending','payment_review') and expired_offer and not (accepted or observed or verified or paid_history)),
  'accepted_quote_holds',count(*) filter (where accepted),
  'observation_holds',count(*) filter (where observed),
  'verification_holds',count(*) filter (where verified),
  'paid_history_holds',count(*) filter (where paid_history),
  'provider_observations',(select count(*) from public.research_assisted_order_payment_observations where method='provider'),
  'superseded_observations',(select count(*) from public.research_assisted_order_observation_corrections)
)::text from facts;
select json_build_object('quote_issue_md5',md5(pg_get_functiondef(
  'public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)'::regprocedure)),
  'quote_accept_md5',md5(pg_get_functiondef(
  'public.research_assisted_order_quote_accept(uuid,integer,bigint,uuid,text,text)'::regprocedure)))::text;
rollback;
