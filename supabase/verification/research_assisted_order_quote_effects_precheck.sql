-- Read-only, aggregate and PII-free. Missing prerequisites are a stop, not a zero.
select jsonb_build_object(
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
)::text;
