-- Disposable PG16/17 lifecycle proof. Run after the unapplied outbox SQL.
-- Every probe is transaction-scoped and leaves zero durable rows.
begin;

do $test$
declare
  v_id uuid;
  v_same uuid;
  v_claim public.research_operational_reporting_outbox%rowtype;
  v_status text;
  v_recovered integer;
begin
  v_id := public.research_enqueue_operational_report(
    'test-idempotency-key-0001', 'daily_operations', '{"scope":"aggregate-only"}'::jsonb,
    '2026-08-02 12:00:00+00'
  );
  v_same := public.research_enqueue_operational_report(
    'test-idempotency-key-0001', 'daily_operations', '{"scope":"must-not-overwrite"}'::jsonb,
    '2026-08-02 12:00:00+00'
  );
  if v_id <> v_same then raise exception 'enqueue idempotency failed'; end if;

  select * into v_claim from public.research_claim_operational_reports(
    1, '2026-08-02 12:00:00+00', interval '1 minute'
  );
  if v_claim.id <> v_id or v_claim.status <> 'processing' or v_claim.attempt_count <> 1 then
    raise exception 'deterministic claim failed';
  end if;

  v_status := public.research_fail_operational_report(
    v_id, 'provider_unavailable', 'Bounded synthetic failure.',
    '2026-08-02 12:00:30+00', 2, interval '1 minute'
  );
  if v_status <> 'retry_scheduled' then raise exception 'retry transition failed'; end if;

  select * into v_claim from public.research_claim_operational_reports(
    1, '2026-08-02 12:01:30+00', interval '1 minute'
  );
  v_status := public.research_fail_operational_report(
    v_id, 'provider_rejected', 'Bounded synthetic terminal failure.',
    '2026-08-02 12:02:00+00', 2, interval '1 minute'
  );
  if v_status <> 'dead_letter' then raise exception 'dead-letter transition failed'; end if;

  v_id := public.research_enqueue_operational_report(
    'test-idempotency-key-0002', 'weekly_operations', '{}'::jsonb,
    '2026-08-02 13:00:00+00'
  );
  select * into v_claim from public.research_claim_operational_reports(
    1, '2026-08-02 13:00:00+00', interval '1 minute'
  );
  v_recovered := public.research_reconcile_operational_reports(
    '2026-08-02 13:02:00+00', interval '1 minute'
  );
  if v_recovered <> 1 then raise exception 'lease reconciliation failed'; end if;
  select * into v_claim from public.research_claim_operational_reports(
    1, '2026-08-02 13:03:00+00', interval '1 minute'
  );
  perform public.research_complete_operational_report(
    v_id, 'synthetic-provider-receipt', '2026-08-02 13:03:30+00'
  );
  if not exists (
    select 1 from public.research_operational_reporting_outbox
    where id = v_id and status = 'succeeded' and provider_receipt_hash is not null
  ) then raise exception 'completion failed'; end if;

end;
$test$;

set local role service_role;
do $service_role_test$
begin
  begin
    update public.research_operational_reporting_outbox
    set status = 'succeeded';
    raise exception 'service_role direct DML unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$service_role_test$;
reset role;

rollback;
