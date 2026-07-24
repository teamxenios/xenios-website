-- ==========================================================================
-- Xenios Research: atomic administrator verification of an activation payment
-- ==========================================================================
-- Additive and idempotent. The function is the single production commit
-- boundary for the verified obligation, audit events, ledger, receipt, first
-- membership period, member activation, and first renewal obligation.
--
-- It requires research-idempotency-keys.sql. It is server-only: PUBLIC, anon,
-- and authenticated receive no EXECUTE grant; service_role is the sole caller.

create extension if not exists "pgcrypto";

create or replace function public.research_fm_activation_verify_commit(
  p_obligation_id uuid,
  p_idempotency_key text,
  p_admin_id text,
  p_admin_role text,
  p_amount_received_cents bigint,
  p_date_received text,
  p_receiving_destination_ref text,
  p_method_id text,
  p_external_ref text,
  p_reconciliation_date text,
  p_note text,
  p_confirmed_received boolean,
  p_verified_at timestamptz,
  p_renewal_human_ref text,
  p_renewal_agreements jsonb,
  p_ip_hash text,
  p_user_agent_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope text := 'fm_activation_verify:' || p_obligation_id::text;
  v_existing_result jsonb;
  v_obligation public.research_fm_obligations%rowtype;
  v_member public.research_members%rowtype;
  v_method public.research_fm_payment_methods%rowtype;
  v_period_id uuid := gen_random_uuid();
  v_renewal_id uuid := gen_random_uuid();
  v_receipt_id uuid := gen_random_uuid();
  v_ledger_id uuid := gen_random_uuid();
  v_admin_event_id uuid := gen_random_uuid();
  v_portal_event_id uuid := gen_random_uuid();
  v_renewal_event_id uuid := gen_random_uuid();
  v_period_sequence integer;
  v_period_end timestamptz := p_verified_at + interval '30 days';
  v_renewal_expiry timestamptz := p_verified_at + interval '90 days';
  v_verification jsonb;
  v_result jsonb;
begin
  if p_admin_id is null or btrim(p_admin_id) = ''
     or p_admin_role is null or p_admin_role not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'code', 'not_permitted');
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = ''
     or p_amount_received_cents is null
     or p_date_received is null
     or p_reconciliation_date is null
     or p_verified_at is null
     or p_renewal_human_ref is null
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$')
     or (p_user_agent_hash is not null and p_user_agent_hash !~ '^[0-9a-f]{64}$')
     or p_confirmed_received is distinct from true
     or p_receiving_destination_ref is null or btrim(p_receiving_destination_ref) = ''
     or p_method_id is null or btrim(p_method_id) = ''
     or p_renewal_human_ref !~ '^XRM-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'
     or p_renewal_agreements is null
     or jsonb_typeof(p_renewal_agreements) <> 'object'
     or p_date_received !~ '^\d{4}-\d{2}-\d{2}$'
     or p_reconciliation_date !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  -- A settled retry is a read-only replay, including after the obligation is
  -- already verified. Authorization and structural validation still run first.
  select result
    into v_existing_result
    from public.research_idempotency_keys
   where scope = v_scope and key = p_idempotency_key;
  if v_existing_result is not null then
    return v_existing_result || jsonb_build_object('replayed', true);
  end if;
  if to_char(to_date(p_date_received, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> p_date_received
     or to_char(to_date(p_reconciliation_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> p_reconciliation_date then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  select *
    into v_obligation
    from public.research_fm_obligations
   where id = p_obligation_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- A concurrent same-key request may have settled while this call waited for
  -- the obligation lock. Re-check before evaluating the now-verified status.
  select result
    into v_existing_result
    from public.research_idempotency_keys
   where scope = v_scope and key = p_idempotency_key;
  if v_existing_result is not null then
    return v_existing_result || jsonb_build_object('replayed', true);
  end if;

  if v_obligation.type <> 'activation_50' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if v_obligation.status = 'verified'
     or exists (
       select 1 from public.research_fm_membership_periods
        where funding_obligation_id = p_obligation_id
     ) then
    return jsonb_build_object('ok', false, 'code', 'already_verified');
  end if;
  if v_obligation.status not in ('submitted', 'under_review') then
    return jsonb_build_object('ok', false, 'code', 'illegal_transition');
  end if;
  if v_obligation.expected_amount_cents <> 5000
     or p_amount_received_cents <> v_obligation.expected_amount_cents
     or coalesce((v_obligation.submission ->> 'amountCents')::bigint, -1) <> v_obligation.expected_amount_cents then
    return jsonb_build_object('ok', false, 'code', 'amount_mismatch');
  end if;
  if v_obligation.currency <> 'USD'
     or v_obligation.submission is null
     or p_method_id <> v_obligation.method ->> 'methodId'
     or p_method_id <> v_obligation.submission ->> 'methodId' then
    return jsonb_build_object('ok', false, 'code', 'method_mismatch');
  end if;

  select *
    into v_method
    from public.research_fm_payment_methods
   where method_id = p_method_id
   for share;
  if not found
     or v_method.enabled is distinct from true
     or v_method.approval_status <> 'approved'
     or v_method.activation_eligible is distinct from true
     or v_method.renewal_eligible is distinct from true
     or v_method.currency <> 'USD'
     or v_method.category <> 'manual_external_payment'
     or (v_method.active_start_at is not null and p_verified_at < v_method.active_start_at)
     or (v_method.active_end_at is not null and p_verified_at >= v_method.active_end_at) then
    return jsonb_build_object('ok', false, 'code', 'method_mismatch');
  end if;

  select *
    into v_member
    from public.research_members
   where id = v_obligation.member_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_member.status <> 'pending_activation' then
    return jsonb_build_object('ok', false, 'code', 'illegal_transition');
  end if;

  if exists (select 1 from public.research_fm_ledger where obligation_id = p_obligation_id)
     or exists (select 1 from public.research_fm_receipts where obligation_id = p_obligation_id)
     or exists (select 1 from public.research_fm_membership_periods where funding_obligation_id = p_obligation_id) then
    return jsonb_build_object('ok', false, 'code', 'already_verified');
  end if;

  select coalesce(max(sequence), 0) + 1
    into v_period_sequence
    from public.research_fm_membership_periods
   where member_id = v_obligation.member_id;

  v_verification := jsonb_build_object(
    'amountReceivedCents', p_amount_received_cents,
    'dateReceived', p_date_received,
    'receivingDestinationRef', btrim(p_receiving_destination_ref),
    'methodId', p_method_id,
    'externalRef', p_external_ref,
    'reconciliationDate', p_reconciliation_date,
    'note', p_note,
    'confirmedReceived', true,
    'verifiedAt', p_verified_at
  );

  -- Reserve only after every refusal check. Any later error rolls the reserve
  -- and every following write back with the function transaction.
  insert into public.research_idempotency_keys(scope, key)
  values (v_scope, p_idempotency_key);

  update public.research_fm_obligations
     set status = 'verified',
         verification = v_verification,
         receiving_account_ref = btrim(p_receiving_destination_ref),
         receipt_ref = v_receipt_id::text
   where id = p_obligation_id;

  insert into public.research_fm_obligation_events(
    event_id, obligation_id, action, actor_type, actor_id, actor_role,
    ip_hash, user_agent_hash, from_status, to_status, detail, occurred_at
  ) values (
    v_admin_event_id, p_obligation_id, 'admin_verified', 'admin', p_admin_id, p_admin_role,
    p_ip_hash, p_user_agent_hash, v_obligation.status, 'verified',
    'payment receipt confirmed by authorized administrator', p_verified_at
  );

  insert into public.research_fm_ledger(
    id, entry_id, member_id, obligation_id, entry_type, amount_cents, actor_id, recorded_at
  ) values (
    gen_random_uuid(), v_ledger_id, v_obligation.member_id, p_obligation_id,
    'activation_payment', 5000, p_admin_id, p_verified_at
  );

  insert into public.research_fm_receipts(
    id, receipt_number, obligation_id, member_id, amount_cents, currency, method_label, issued_at
  ) values (
    v_receipt_id, 'RCPT-' || v_obligation.human_ref, p_obligation_id,
    v_obligation.member_id, 5000, 'USD', v_obligation.method ->> 'label', p_verified_at
  );

  update public.research_members
     set status = 'active',
         billing_state = 'active',
         activated_at = coalesce(activated_at, p_verified_at),
         updated_at = p_verified_at
   where id = v_obligation.member_id;

  insert into public.research_fm_membership_periods(
    id, member_id, sequence, starts_at, ends_at, funding_obligation_id, created_at
  ) values (
    v_period_id, v_obligation.member_id, v_period_sequence, p_verified_at,
    v_period_end, p_obligation_id, p_verified_at
  );

  insert into public.research_fm_obligations(
    id, human_ref, member_id, type, expected_amount_cents, currency, description,
    status, bridge_phase, method, agreements, submission, verification,
    receiving_account_ref, receipt_ref, created_at, due_at, expires_at
  ) values (
    v_renewal_id, p_renewal_human_ref, v_obligation.member_id, 'renewal_25',
    2500, 'USD',
    'Founding membership renewal, $25. Covers the next 30 calendar days of membership. You initiate this payment; nothing is charged automatically.',
    'upcoming', v_obligation.bridge_phase, v_obligation.method, p_renewal_agreements,
    null, null, null, null, p_verified_at, v_period_end, v_renewal_expiry
  );

  insert into public.research_fm_obligation_events(
    event_id, obligation_id, action, actor_type, actor_id, actor_role,
    ip_hash, user_agent_hash, from_status, to_status, detail, occurred_at
  ) values (
    v_renewal_event_id, v_renewal_id, 'created', 'system', null, null,
    null, null, null, 'upcoming', 'type=renewal_25', p_verified_at
  );

  insert into public.research_fm_obligation_events(
    event_id, obligation_id, action, actor_type, actor_id, actor_role,
    ip_hash, user_agent_hash, from_status, to_status, detail, occurred_at
  ) values (
    v_portal_event_id, p_obligation_id, 'portal_unlocked', 'system', null, null,
    null, null, 'verified', 'verified', 'first membership period created', p_verified_at
  );

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'obligation_id', p_obligation_id::text,
    'period_id', v_period_id::text,
    'renewal_obligation_id', v_renewal_id::text,
    'receipt_id', v_receipt_id::text,
    'ledger_entry_id', v_ledger_id::text,
    'effective_at', p_verified_at::text
  );

  update public.research_idempotency_keys
     set result = v_result, settled_at = p_verified_at
   where scope = v_scope and key = p_idempotency_key;

  return v_result;
end;
$$;

revoke all on function public.research_fm_activation_verify_commit(
  uuid, text, text, text, bigint, text, text, text, text, text, text,
  boolean, timestamptz, text, jsonb, text, text
) from public, anon, authenticated;

grant execute on function public.research_fm_activation_verify_commit(
  uuid, text, text, text, bigint, text, text, text, text, text, text,
  boolean, timestamptz, text, jsonb, text, text
) to service_role;
