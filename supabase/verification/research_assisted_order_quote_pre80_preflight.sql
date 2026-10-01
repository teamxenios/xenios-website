-- Read-only, PII-free PRE-80 inventory. Uses M71 only, never financial tables.
-- Derived from Claude report 23 at 7882145; split from its post-80 queries.
-- Not authorization to contact a managed project. Identify the exact approved
-- non-production project, schema/ledger state and executor before any such run.
begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';

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

-- Any non-terminal frozen row is a NO-GO absent a reviewed historical
-- resolution operation or an explicit founder decision accepting that freeze.
-- A missing table or timeout is unavailable evidence, never a zero count.
select count(*) as nonterminal_frozen_rows_requiring_decision
from public.research_assisted_order_requests r
where r.status not in ('closed','cancelled')
  and (r.status in ('paid','supplier_processing','shipped','delivered')
    or exists (select 1 from public.research_assisted_order_events e
               where e.request_id = r.id and e.status = 'paid'));
commit;
