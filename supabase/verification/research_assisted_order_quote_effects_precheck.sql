-- Read-only, aggregate and PII-free. Missing prerequisites are a stop, not a zero.
-- PRE-88 initial apply only. After installation use effects_postcheck instead;
-- existing correctly bound rows are not distinguished by this conservative census.
begin isolation level repeatable read read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local row_security = off;
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
  'schemaVersion','hl12_pre88_notification_census_v1',
  'legacy_paid_notices',t.legacy_paid_notices,
  'reserved_verification_keys',t.reserved_verification_keys,
  'adoption_required_outbox_rows',t.adoption_required_outbox_rows,
  'invalid_status_envelopes',t.invalid_status_envelopes,
  'delivery_status_counts',coalesce((select jsonb_object_agg(status,rows) from delivery),'{}'::jsonb),
  'notification_chain_gate',case when t.adoption_required_outbox_rows > 0 or t.invalid_status_envelopes > 0
    or exists(select 1 from public.research_assisted_order_payment_verifications)
    then 'NO_GO' else 'CLEAR_COUNTS_ONLY_NOT_AUTHORIZATION' end,
  'verifications',(select count(*) from public.research_assisted_order_payment_verifications),
  'provider_observations',(select count(*) from public.research_assisted_order_payment_observations where method='provider'),
  'provider_verifications',(select count(*) from public.research_assisted_order_payment_verifications where method='provider'),
  'historical_paid_holds',(select count(*) from public.research_assisted_order_requests r
    where (r.status in ('paid','supplier_processing','shipped','delivered','closed')
      or exists (select 1 from public.research_assisted_order_events e where e.request_id=r.id and e.status='paid'))
    and not exists (select 1 from public.research_assisted_order_payment_verifications v where v.request_id=r.id)),
  'canonical_audit_events',(select count(*) from public.research_assisted_order_audit_events_v1),
  'canonical_outbox_rows',(select count(*) from public.research_notification_outbox),
  'bound_verifier_md5',md5(pg_get_functiondef('public.research_assisted_order_payment_verify_bound(uuid,uuid,uuid)'::regprocedure)),
  'private_verifier_md5',md5(pg_get_functiondef('public.research_assisted_order_payment_verify(uuid,uuid)'::regprocedure))
)::text from totals t;
commit;
