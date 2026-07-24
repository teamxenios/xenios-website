\set ON_ERROR_STOP on

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end
$roles$;

create table public.research_applications (
  id uuid primary key
);

\ir ../research-members.sql
\ir ../research-member-billing.sql
\ir ../research-fm-payment-methods.sql
\ir ../research-fm-obligations.sql
\ir ../research-idempotency-keys.sql
\ir ../research-fm-activation-verify-atomic.sql

insert into public.research_fm_payment_methods (
  method_id, provider_code, member_facing_name, admin_facing_name, enabled,
  duration, active_start_at, active_end_at, currency, activation_eligible,
  renewal_eligible, product_eligible, settlement_time, receiving_legal_entity,
  ownership_classification, approval_status, approval_date, approved_by,
  receiving_instructions_enc, receiving_instructions_masked
) values (
  'cashapp-test', 'cash_app', 'Cash App', 'Cash App test', true,
  'temporary', '2026-07-01T00:00:00Z', '2026-08-31T00:00:00Z', 'USD', true,
  true, false, 'same day', 'Xenios', 'business', 'approved',
  '2026-07-01T00:00:00Z', 'admin-test', 'enc.v1:test:test:test', 'masked'
);

insert into public.research_applications(id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');

insert into public.research_members(
  id, application_id, auth_user_id, email, first_name, status, billing_state
) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001', 'one@example.test', 'One', 'pending_activation', 'activation_pending'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000002', 'two@example.test', 'Two', 'pending_activation', 'activation_pending'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003',
   '30000000-0000-4000-8000-000000000003', 'three@example.test', 'Three', 'pending_activation', 'activation_pending');

insert into public.research_fm_obligations(
  id, human_ref, member_id, type, expected_amount_cents, currency, description,
  status, bridge_phase, method, agreements, submission, created_at, due_at, expires_at
) values
  (
    '40000000-0000-4000-8000-000000000001', 'XRM-AAAAAAA2',
    '20000000-0000-4000-8000-000000000001', 'activation_50', 5000, 'USD', 'activation',
    'submitted', 'phase_a_manual_bridge',
    '{"methodId":"cashapp-test","category":"manual_external_payment","label":"Cash App","instructionsRef":"opaque","productPurchaseEligible":false,"capturedAt":"2026-07-24T00:00:00Z"}',
    '{"capturedAt":"2026-07-24T00:00:00Z","agreements":[]}',
    '{"methodId":"cashapp-test","amountCents":5000,"sentDate":"2026-07-24","accuracyCertified":true}',
    '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z', '2026-09-22T00:00:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000002', 'XRM-BBBBBBB2',
    '20000000-0000-4000-8000-000000000002', 'activation_50', 5000, 'USD', 'activation',
    'submitted', 'phase_a_manual_bridge',
    '{"methodId":"cashapp-test","category":"manual_external_payment","label":"Cash App","instructionsRef":"opaque","productPurchaseEligible":false,"capturedAt":"2026-07-24T00:00:00Z"}',
    '{"capturedAt":"2026-07-24T00:00:00Z","agreements":[]}',
    '{"methodId":"cashapp-test","amountCents":5000,"sentDate":"2026-07-24","accuracyCertified":true}',
    '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z', '2026-09-22T00:00:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000003', 'XRM-STUVWXYZ',
    '20000000-0000-4000-8000-000000000003', 'renewal_25', 2500, 'USD', 'collision',
    'upcoming', 'phase_a_manual_bridge',
    '{"methodId":"cashapp-test","category":"manual_external_payment","label":"Cash App","instructionsRef":"opaque","productPurchaseEligible":false,"capturedAt":"2026-07-24T00:00:00Z"}',
    '{"capturedAt":"2026-07-24T00:00:00Z","agreements":[]}',
    null, '2026-07-24T00:00:00Z', '2026-08-23T00:00:00Z', '2026-10-22T00:00:00Z'
  );

do $test$
declare
  v_result jsonb;
  v_count bigint;
begin
  v_result := public.research_fm_activation_verify_commit(
    '40000000-0000-4000-8000-000000000001', 'happy-key', 'admin-test', 'owner',
    5000, '2026-07-24', 'checked-destination', 'cashapp-test', null,
    '2026-07-24', null, true, '2026-07-24T18:30:00Z',
    'XRM-JKLMNPQR', '{"capturedAt":"2026-07-24T18:30:00Z","agreements":[]}',
    repeat('a', 64), repeat('b', 64)
  );
  if v_result ->> 'ok' <> 'true' or v_result ->> 'replayed' <> 'false' then
    raise exception 'happy commit did not succeed: %', v_result;
  end if;

  if (select status from public.research_fm_obligations where id = '40000000-0000-4000-8000-000000000001') <> 'verified'
     or (select status from public.research_members where id = '20000000-0000-4000-8000-000000000001') <> 'active'
     or (select billing_state from public.research_members where id = '20000000-0000-4000-8000-000000000001') <> 'active' then
    raise exception 'member/obligation activation state missing';
  end if;
  if (select count(*) from public.research_fm_ledger where obligation_id = '40000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.research_fm_receipts where obligation_id = '40000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.research_fm_membership_periods where funding_obligation_id = '40000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.research_fm_obligations where human_ref = 'XRM-JKLMNPQR' and type = 'renewal_25') <> 1
     or (select count(*) from public.research_fm_obligation_events where obligation_id = '40000000-0000-4000-8000-000000000001' and action in ('admin_verified','portal_unlocked')) <> 2 then
    raise exception 'atomic artifacts missing or duplicated';
  end if;

  v_result := public.research_fm_activation_verify_commit(
    '40000000-0000-4000-8000-000000000001', 'happy-key', 'admin-test', 'owner',
    5000, '2026-07-24', 'checked-destination', 'cashapp-test', null,
    '2026-07-24', null, true, '2026-07-24T18:30:00Z',
    'XRM-ABCDEFGH', '{"capturedAt":"2026-07-24T18:30:00Z","agreements":[]}',
    repeat('a', 64), repeat('b', 64)
  );
  if v_result ->> 'ok' <> 'true' or v_result ->> 'replayed' <> 'true' then
    raise exception 'same-key replay failed: %', v_result;
  end if;
  if (select count(*) from public.research_fm_ledger where obligation_id = '40000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.research_fm_receipts where obligation_id = '40000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.research_fm_membership_periods where funding_obligation_id = '40000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'replay duplicated artifacts';
  end if;

  v_result := public.research_fm_activation_verify_commit(
    '40000000-0000-4000-8000-000000000001', 'happy-key', 'admin-test', 'support',
    5000, '2026-07-24', 'checked-destination', 'cashapp-test', null,
    '2026-07-24', null, true, '2026-07-24T18:30:00Z',
    'XRM-ABCDEFGH', '{"capturedAt":"2026-07-24T18:30:00Z","agreements":[]}', null, null
  );
  if v_result ->> 'code' <> 'not_permitted' then
    raise exception 'settled replay bypassed administrator authorization';
  end if;

  begin
    perform public.research_fm_activation_verify_commit(
      '40000000-0000-4000-8000-000000000002', 'rollback-key', 'admin-test', 'owner',
      5000, '2026-07-24', 'checked-destination', 'cashapp-test', null,
      '2026-07-24', null, true, '2026-07-24T18:30:00Z',
      'XRM-STUVWXYZ', '{"capturedAt":"2026-07-24T18:30:00Z","agreements":[]}', null, null
    );
    raise exception 'expected late unique violation was not raised';
  exception when unique_violation then
    null;
  end;

  if (select status from public.research_fm_obligations where id = '40000000-0000-4000-8000-000000000002') <> 'submitted'
     or (select status from public.research_members where id = '20000000-0000-4000-8000-000000000002') <> 'pending_activation'
     or exists (select 1 from public.research_fm_ledger where obligation_id = '40000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.research_fm_receipts where obligation_id = '40000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.research_fm_membership_periods where funding_obligation_id = '40000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.research_idempotency_keys where scope = 'fm_activation_verify:40000000-0000-4000-8000-000000000002') then
    raise exception 'late failure left a partial write';
  end if;

  v_result := public.research_fm_activation_verify_commit(
    '40000000-0000-4000-8000-000000000002', 'bad-amount', 'admin-test', 'owner',
    null, '2026-07-24', 'checked-destination', 'cashapp-test', null,
    '2026-07-24', null, true, '2026-07-24T18:30:00Z',
    'XRM-ABCDEFGH', '{"capturedAt":"2026-07-24T18:30:00Z","agreements":[]}', null, null
  );
  if v_result ->> 'code' <> 'validation_failed' then
    raise exception 'NULL amount bypassed validation';
  end if;
end
$test$;

select 'atomic activation verification integration: ok' as result;
