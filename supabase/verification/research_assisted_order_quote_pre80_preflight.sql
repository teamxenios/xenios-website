-- Read-only, PII-free PRE-80 inventory. Requires M71 AND the canonical outbox,
-- never financial tables. Report24 LENS-01: delivery status is not adoption.
-- Not authorization to contact a managed project. Identify the exact approved
-- non-production project, schema/ledger state and executor before any such run.
begin isolation level repeatable read read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
-- Error instead of silently reporting an RLS-filtered zero. This does not
-- bypass RLS or grant access; the approved reader must already see every row.
set local row_security = off;

select r.status,
       count(*) as requests,
       count(*) filter (where exists (select 1 from public.research_assisted_order_events e
                                      where e.request_id = r.id and e.status = 'paid')) as with_paid_event,
       count(*) filter (where r.status in ('paid','supplier_processing','shipped','delivered','closed')
                           or exists (select 1 from public.research_assisted_order_events e
                                      where e.request_id = r.id and e.status = 'paid')) as frozen_after_86,
       count(*) filter (where r.status in ('payment_pending','payment_review')) as in_flight_payment_stage,
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

-- Mirrors M88's exact pre-binding-column predicates. Do not join to requests:
-- closed, cancelled and orphan-reference notices are equally adoption blockers.
-- Do not filter by delivery status: sent/delivered/cancelled rows still count.
-- Missing outbox, permission failure, partial results or timeout = UNAVAILABLE.
-- Only a completed transaction with every result is usable evidence.
with envelopes as materialized (
  select status,
    template_key = 'research.assisted_order.status_changed.customer'
      and payload->>'status' = 'paid' as legacy_paid,
    event_key like 'assisted-order:%:payment-verification:%' as reserved_key,
    template_key = 'research.assisted_order.status_changed.customer'
      and (jsonb_typeof(payload) is distinct from 'object'
        or jsonb_typeof(payload->'status') is distinct from 'string'
        or payload->>'status' not in ('submitted','reviewing','waiting_on_customer','identity_requested',
          'identity_received','agreements_pending','agreements_complete','payment_pending','payment_review',
          'paid','supplier_processing','shipped','delivered','closed','cancelled')) as invalid_status
  from public.research_notification_outbox
), totals as (
  select count(*) filter (where legacy_paid) as legacy_paid_notices,
    count(*) filter (where reserved_key) as reserved_verification_keys,
    count(*) filter (where legacy_paid or reserved_key) as adoption_required_outbox_rows,
    count(*) filter (where invalid_status) as invalid_status_envelopes
  from envelopes
), delivery as (
  select status, count(*) as rows from envelopes
  where legacy_paid or reserved_key or invalid_status group by status
)
select jsonb_build_object(
  'schemaVersion','hl12_pre80_notification_census_v1',
  'legacy_paid_notices',t.legacy_paid_notices,
  'reserved_verification_keys',t.reserved_verification_keys,
  'adoption_required_outbox_rows',t.adoption_required_outbox_rows,
  'invalid_status_envelopes',t.invalid_status_envelopes,
  'delivery_status_counts',coalesce((select jsonb_object_agg(status,rows) from delivery),'{}'::jsonb),
  'notification_chain_gate',case when t.adoption_required_outbox_rows > 0 or t.invalid_status_envelopes > 0
    then 'NO_GO' else 'CLEAR_COUNTS_ONLY_NOT_AUTHORIZATION' end
)::text from totals t;
commit;
