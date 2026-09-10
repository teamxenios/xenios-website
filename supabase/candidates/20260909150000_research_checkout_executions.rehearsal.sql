-- REHEARSAL of the durable checkout execution functions. SYNTHETIC DATA ONLY.
-- Run AFTER the candidate is installed on the rehearsal database and the
-- postcheck passed. The whole script is ONE transaction that ends in ROLLBACK:
-- nothing it inserts survives, no customer row is read, no credential prints.
-- Every expectation is asserted; the first failure aborts with a message that
-- names the case. Exit status 0 with the final notice "checkout executions
-- rehearsal PASS" is the receipt A records (with the database identity, the
-- application SHA and the candidate's LF SHA-256).
--
-- Executor: the migration executor (SUPERUSER or BYPASSRLS), stop-on-error:
--   psql -X -v ON_ERROR_STOP=1 -f 20260909150000_research_checkout_executions.rehearsal.sql
--
-- It exercises: creation, the version compare-and-swap on claim and
-- record_provider, the first-attempt stamp, the identity trigger, the
-- reservation-completeness failure paths (evidence retained, nothing else
-- touched), the full capture commit (order, state event, reservations, store
-- credit spend exactly once), commit idempotence, cancellation settlement
-- (provider outcome and local settlement as two facts), the webhook inbox
-- receipt uniqueness, and duplicate submission refusal. True two-session
-- concurrency is a separate documented step (see the runbook).
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';
set local row_security = off;

create function pg_temp.expect(p_ok boolean, p_case text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'REHEARSAL FAIL: %', p_case;
  end if;
end $$;

-- Every raise from a function under test is caught here so a case can assert on it.
create function pg_temp.error_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

do $rehearsal$
declare
  v_member  uuid := '00000000-0000-4000-8000-0000000000f1';
  v_other   uuid := '00000000-0000-4000-8000-0000000000f2';
  v_order   uuid := '00000000-0000-4000-8000-00000000a001';
  v_order2  uuid := '00000000-0000-4000-8000-00000000a002';
  v_exec    uuid := '00000000-0000-4000-8000-00000000e001';
  v_row     public.research_checkout_executions%rowtype;
  v_orow    public.research_orders%rowtype;
  v_count   bigint;
  v_err     text;
  v_at      timestamptz := '2026-09-09T12:00:00Z';
  v_digest  text := repeat('a', 64);
begin
  -- Preconditions: the rehearsal database must carry the installed candidate and no synthetic leftovers.
  perform pg_temp.expect(to_regclass('public.research_checkout_executions') is not null, 'candidate installed (executions table)');
  perform pg_temp.expect(to_regclass('public.research_payment_webhook_inbox') is not null, 'candidate installed (inbox table)');
  perform pg_temp.expect(not exists (select 1 from public.research_orders where member_id in (v_member, v_other)), 'no synthetic member rows pre-exist');

  -- ---------------------------------------------------------------------
  -- Fixtures: one buyer with 1000 cents of approved credit, one order in
  -- checkout_pending (20000 + 1000 shipping - 500 credit = 20500), two lines,
  -- two held reservations that exactly cover the lines.
  -- ---------------------------------------------------------------------
  insert into public.research_store_credit_ledger (member_id, amount_cents, state, reason, available_at, actor_type, actor_id, created_at)
  values (v_member, 1000, 'approved', 'service_recovery', v_at - interval '30 days', 'system', 'rehearsal', v_at - interval '30 days');

  insert into public.research_orders (id, member_id, state, subtotal_cents, shipping_cents, store_credit_applied_cents, total_cents, checkout_idempotency_key, last_idempotency_key, created_at, updated_at)
  values (v_order, v_member, 'checkout_pending', 20000, 1000, 500, 20500, 'req_rehearsal_0001', 'req_rehearsal_0001', v_at, v_at);
  insert into public.research_order_lines (order_id, sku, display_name, quantity, unit_price_cents, line_total_cents, fulfillment_owner)
  values (v_order, 'REH-A', 'Rehearsal A', 2, 7500, 15000, 'xenios'),
         (v_order, 'REH-B', 'Rehearsal B', 1, 5000, 5000, 'xenios');
  insert into public.research_lot_reservations (reservation_id, member_id, sku, quantity, status, expires_at, created_at)
  values ('res-reh-a', v_member, 'REH-A', 2, 'held', v_at + interval '1 hour', v_at),
         ('res-reh-b', v_member, 'REH-B', 1, 'held', v_at + interval '1 hour', v_at);

  -- ---------------------------------------------------------------------
  -- Case 1: creation and the request-key identity.
  -- ---------------------------------------------------------------------
  insert into public.research_checkout_executions
    (id, member_id, request_key, request_body_sha256, order_id, phase, version, amount_cents, payment_method_reference, quote_fingerprint,
     authorization_key, capture_key, cancel_key, reservation_ids, created_at)
  values
    (v_exec, v_member, 'req_rehearsal_0001', v_digest, v_order, 'reserved', 1, 20500, 'pm_rehearsal_card', 'quote-rehearsal-1',
     'xr-auth-rehearsal-0001', 'xr-capture-rehearsal-0001', 'xr-cancel-rehearsal-0001', array['res-reh-a','res-reh-b'], v_at);
  -- Duplicate submission under the same (member, request key) is refused by the database.
  v_err := pg_temp.error_of(format($q$insert into public.research_checkout_executions
    (member_id, request_key, request_body_sha256, order_id, amount_cents, payment_method_reference, quote_fingerprint, authorization_key, capture_key, cancel_key)
    values (%L, 'req_rehearsal_0001', %L, %L, 20500, 'pm_rehearsal_card', 'quote-rehearsal-1', 'xr-auth-dup', 'xr-capture-dup', 'xr-cancel-dup')$q$,
    v_member, v_digest, v_order));
  perform pg_temp.expect(v_err is not null and v_err ilike '%unique%', 'case 1: duplicate (member, request_key) refused: ' || coalesce(v_err, 'no error'));
  -- A paid phase without a reference is unrepresentable.
  v_err := pg_temp.error_of(format($q$update public.research_checkout_executions set phase = 'authorized' where id = %L$q$, v_exec));
  perform pg_temp.expect(v_err is not null and v_err ilike '%paid_needs_reference%', 'case 1: paid phase needs a reference: ' || coalesce(v_err, 'no error'));

  -- ---------------------------------------------------------------------
  -- Case 2: claim stamps the first attempt once; stale versions lose.
  -- ---------------------------------------------------------------------
  select * into v_row from public.research_checkout_execution_claim(v_exec, 1, 'authorizing');
  perform pg_temp.expect(v_row.id is not null and v_row.phase = 'authorizing' and v_row.version = 2, 'case 2: first claim authorizing v1->v2');
  perform pg_temp.expect(v_row.authorization_first_attempted_at is not null, 'case 2: first attempt stamped');
  select count(*) into v_count from public.research_checkout_execution_claim(v_exec, 1, 'authorizing');
  perform pg_temp.expect(v_count = 0, 'case 2: stale version claim returns zero rows');
  v_err := pg_temp.error_of(format($q$select * from public.research_checkout_execution_claim(%L, 2, 'committed')$q$, v_exec));
  perform pg_temp.expect(v_err ilike '%not a claimable phase%', 'case 2: unclaimable phase refused');

  -- ---------------------------------------------------------------------
  -- Case 3: provider evidence; the reference is learned once.
  -- ---------------------------------------------------------------------
  select * into v_row from public.research_checkout_execution_record_provider(v_exec, 2,
    jsonb_build_object('kind','authorized','providerReference','pi_rehearsal_0001','amountCents',20500,'currency','usd','memberId',v_member::text,'orderId',v_order::text));
  perform pg_temp.expect(v_row.phase = 'authorized' and v_row.version = 3 and v_row.provider_reference = 'pi_rehearsal_0001', 'case 3: authorized recorded v2->v3');
  select count(*) into v_count from public.research_checkout_execution_record_provider(v_exec, 3,
    jsonb_build_object('kind','authorized','providerReference','pi_other','amountCents',20500,'currency','usd'));
  perform pg_temp.expect(v_count = 0, 'case 3: conflicting provider reference returns zero rows');
  select * into v_row from public.research_checkout_executions where id = v_exec;
  perform pg_temp.expect(v_row.version = 3 and v_row.provider_reference = 'pi_rehearsal_0001', 'case 3: conflicting reference changed nothing');
  v_err := pg_temp.error_of(format($q$select * from public.research_checkout_execution_record_provider(%L, 3, '{"kind":"paid"}'::jsonb)$q$, v_exec));
  perform pg_temp.expect(v_err ilike '%unknown result kind%', 'case 3: unknown evidence kind refused');

  -- ---------------------------------------------------------------------
  -- Case 4: identity is immutable after insert.
  -- ---------------------------------------------------------------------
  v_err := pg_temp.error_of(format($q$update public.research_checkout_executions set price_version = 'v2' where id = %L$q$, v_exec));
  perform pg_temp.expect(v_err ilike '%immutable%', 'case 4: price_version immutable');
  v_err := pg_temp.error_of(format($q$update public.research_checkout_executions set reservation_ids = array['res-reh-a'] where id = %L$q$, v_exec));
  perform pg_temp.expect(v_err ilike '%immutable%', 'case 4: reservation_ids immutable');
  -- now() is transaction-stable and equals the earlier claim stamp in this
  -- rehearsal. Change the stored value by exactly one microsecond instead.
  v_err := pg_temp.error_of(format($q$update public.research_checkout_executions set authorization_first_attempted_at = authorization_first_attempted_at + interval '1 microsecond' where id = %L$q$, v_exec));
  perform pg_temp.expect(v_err ilike '%immutable%', 'case 4: first-attempt stamp immutable once set');
  v_err := pg_temp.error_of(format($q$update public.research_checkout_executions set authorization_first_attempted_at = null where id = %L$q$, v_exec));
  perform pg_temp.expect(v_err ilike '%immutable%', 'case 4: first-attempt stamp cannot be cleared');
  v_err := pg_temp.error_of(format($q$update public.research_checkout_executions set provider_reference = 'pi_other' where id = %L$q$, v_exec));
  perform pg_temp.expect(v_err ilike '%immutable%', 'case 4: provider reference immutable once learned');
  v_err := pg_temp.error_of(format($q$update public.research_checkout_executions set request_body_sha256 = %L where id = %L$q$, repeat('b', 64), v_exec));
  perform pg_temp.expect(v_err ilike '%immutable%', 'case 4: request digest immutable');

  -- ---------------------------------------------------------------------
  -- Case 5: capture, then the ONE-transaction commit.
  -- ---------------------------------------------------------------------
  select * into v_row from public.research_checkout_execution_claim(v_exec, 3, 'capturing');
  perform pg_temp.expect(v_row.phase = 'capturing' and v_row.version = 4, 'case 5: claim capturing v3->v4');
  select * into v_row from public.research_checkout_execution_record_provider(v_exec, 4,
    jsonb_build_object('kind','captured','providerReference','pi_rehearsal_0001','amountCents',20500,'currency','usd','memberId',v_member::text,'orderId',v_order::text));
  perform pg_temp.expect(v_row.phase = 'captured' and v_row.version = 5, 'case 5: captured recorded v4->v5');
  -- commit_captured before capture evidence is refused (a second synthetic execution in authorized phase).
  insert into public.research_orders (id, member_id, state, subtotal_cents, shipping_cents, store_credit_applied_cents, total_cents, checkout_idempotency_key, created_at, updated_at)
  values (v_order2, v_member, 'checkout_pending', 5000, 0, 0, 5000, 'req_rehearsal_0002', v_at, v_at);
  insert into public.research_checkout_executions
    (id, member_id, request_key, request_body_sha256, order_id, phase, version, provider_reference, amount_cents, payment_method_reference, quote_fingerprint,
     authorization_key, capture_key, cancel_key, reservation_ids, created_at)
  values
    ('00000000-0000-4000-8000-00000000e002', v_member, 'req_rehearsal_0002', v_digest, v_order2, 'authorized', 3, 'pi_rehearsal_0002', 5000, 'pm_rehearsal_card', 'quote-rehearsal-2',
     'xr-auth-rehearsal-0002', 'xr-capture-rehearsal-0002', 'xr-cancel-rehearsal-0002', '{}', v_at);
  v_err := pg_temp.error_of(format($q$select * from public.research_checkout_execution_commit_captured(%L, 3, %L)$q$, '00000000-0000-4000-8000-00000000e002', v_at));
  perform pg_temp.expect(v_err ilike '%without capture evidence%', 'case 5: commit without capture evidence refused');

  select * into v_row from public.research_checkout_execution_commit_captured(v_exec, 5, v_at);
  perform pg_temp.expect(v_row.phase = 'committed' and v_row.version = 6 and v_row.committed_at = v_at and v_row.local_commit_failure is null, 'case 5: committed v5->v6');
  select * into v_orow from public.research_orders where id = v_order;
  perform pg_temp.expect(v_orow.state = 'payment_captured' and v_orow.payment_reference = 'pi_rehearsal_0001'
    and v_orow.captured_amount_cents = 20500 and v_orow.authorized_amount_cents = 20500
    and v_orow.last_idempotency_key = 'xr-capture-rehearsal-0001' and v_orow.placed_at = v_at, 'case 5: canonical order payment_captured with evidence');
  select count(*) into v_count from public.research_order_state_events
   where order_id = v_order and from_state = 'checkout_pending' and to_state = 'payment_captured'
     and actor_type = 'system' and actor_id = 'durable_checkout' and provider_reference = 'pi_rehearsal_0001' and idempotency_key = 'xr-capture-rehearsal-0001';
  perform pg_temp.expect(v_count = 1, 'case 5: exactly one state event');
  select count(*) into v_count from public.research_lot_reservations
   where reservation_id in ('res-reh-a','res-reh-b') and status = 'finalized' and finalized_at = v_at;
  perform pg_temp.expect(v_count = 2, 'case 5: both reservations finalized');
  select count(*) into v_count from public.research_store_credit_ledger
   where member_id = v_member and amount_cents = -500 and state = 'approved' and reason = 'manual_adjustment'
     and actor_type = 'system' and actor_id = v_order::text and reverses_id is null;
  perform pg_temp.expect(v_count = 1, 'case 5: exactly one store-credit spend row (-500)');

  -- Idempotence: the same version again returns the committed row unchanged; a stale version returns nothing; no second effect.
  select * into v_row from public.research_checkout_execution_commit_captured(v_exec, 6, v_at + interval '1 minute');
  perform pg_temp.expect(v_row.phase = 'committed' and v_row.version = 6 and v_row.committed_at = v_at, 'case 5: repeated commit returns the row unchanged');
  select count(*) into v_count from public.research_checkout_execution_commit_captured(v_exec, 5, v_at);
  perform pg_temp.expect(v_count = 0, 'case 5: stale-version commit returns zero rows');
  select count(*) into v_count from public.research_store_credit_ledger where member_id = v_member and amount_cents < 0;
  perform pg_temp.expect(v_count = 1, 'case 5: still exactly one spend row');
  select count(*) into v_count from public.research_order_state_events where order_id = v_order;
  perform pg_temp.expect(v_count = 1, 'case 5: still exactly one state event');

  -- ---------------------------------------------------------------------
  -- Case 6: reservation completeness at commit. Each sub-case is its own
  -- execution in the captured phase; a failure keeps the capture evidence,
  -- parks the execution and touches nothing else.
  -- ---------------------------------------------------------------------
  declare
    v_case record;
    v_oid uuid;
    v_eid uuid;
    v_i integer := 0;
  begin
    for v_case in select * from (values
        ('missing',        array['res-c6-1-a','res-c6-1-missing'],   'reservations_missing:'),
        ('released',       array['res-c6-2-a','res-c6-2-released'],  'reservations_not_held:'),
        ('quantity',       array['res-c6-3-a'],                       'reservation_quantities_differ_from_order_lines'),
        -- Lines with no reservations at all: the per-SKU quantity comparison
        -- (3 ordered, 0 held) parks it before the dedicated branch is reached.
        ('none_for_lines', array[]::text[],                            'reservation_quantities_differ_from_order_lines'),
        ('finalized_ok',   array['res-c6-5-a'],                       null)
      ) as t(name, ids, failure_prefix)
    loop
      v_i := v_i + 1;
      v_oid := ('00000000-0000-4000-8000-00000000b00' || v_i)::uuid;
      v_eid := ('00000000-0000-4000-8000-00000000c00' || v_i)::uuid;
      insert into public.research_orders (id, member_id, state, subtotal_cents, shipping_cents, store_credit_applied_cents, total_cents, checkout_idempotency_key, created_at, updated_at)
      values (v_oid, v_member, 'checkout_pending', 3000, 0, 0, 3000, 'req_rehearsal_c6_' || v_i, v_at, v_at);
      insert into public.research_order_lines (order_id, sku, display_name, quantity, unit_price_cents, line_total_cents, fulfillment_owner)
      values (v_oid, 'REH-C6', 'Rehearsal C6', 3, 1000, 3000, 'xenios');
      -- Held reservations per sub-case.
      if v_case.name = 'missing' then
        insert into public.research_lot_reservations (reservation_id, member_id, sku, quantity, status, expires_at) values ('res-c6-1-a', v_member, 'REH-C6', 3, 'held', v_at + interval '1 hour');
      elsif v_case.name = 'released' then
        insert into public.research_lot_reservations (reservation_id, member_id, sku, quantity, status, expires_at) values ('res-c6-2-a', v_member, 'REH-C6', 2, 'held', v_at + interval '1 hour');
        insert into public.research_lot_reservations (reservation_id, member_id, sku, quantity, status, expires_at, released_at) values ('res-c6-2-released', v_member, 'REH-C6', 1, 'released', v_at + interval '1 hour', v_at);
      elsif v_case.name = 'quantity' then
        insert into public.research_lot_reservations (reservation_id, member_id, sku, quantity, status, expires_at) values ('res-c6-3-a', v_member, 'REH-C6', 2, 'held', v_at + interval '1 hour');
      elsif v_case.name = 'finalized_ok' then
        -- An interrupted earlier commit already finalized the hold: the retry commits normally.
        insert into public.research_lot_reservations (reservation_id, member_id, sku, quantity, status, expires_at, finalized_at) values ('res-c6-5-a', v_member, 'REH-C6', 3, 'finalized', v_at + interval '1 hour', v_at);
      end if;
      insert into public.research_checkout_executions
        (id, member_id, request_key, request_body_sha256, order_id, phase, version, provider_reference, amount_cents, payment_method_reference, quote_fingerprint,
         authorization_key, capture_key, cancel_key, reservation_ids, authorization_first_attempted_at, created_at)
      values
        (v_eid, v_member, 'req_rehearsal_c6_' || v_i, v_digest, v_oid, 'captured', 5, 'pi_rehearsal_c6_' || v_i, 3000, 'pm_rehearsal_card', 'quote-c6-' || v_i,
         'xr-auth-c6-' || v_i, 'xr-capture-c6-' || v_i, 'xr-cancel-c6-' || v_i, v_case.ids, v_at, v_at);
      select * into v_row from public.research_checkout_execution_commit_captured(v_eid, 5, v_at);
      if v_case.failure_prefix is null then
        perform pg_temp.expect(v_row.phase = 'committed' and v_row.version = 6, 'case 6/' || v_case.name || ': commits normally');
        select * into v_orow from public.research_orders where id = v_oid;
        perform pg_temp.expect(v_orow.state = 'payment_captured', 'case 6/' || v_case.name || ': order captured');
      else
        perform pg_temp.expect(v_row.phase = 'reconciliation_required' and v_row.version = 6, 'case 6/' || v_case.name || ': parked in reconciliation_required');
        perform pg_temp.expect(v_row.local_commit_failure like v_case.failure_prefix || '%', 'case 6/' || v_case.name || ': local_commit_failure recorded (' || coalesce(v_row.local_commit_failure, '<null>') || ')');
        perform pg_temp.expect(v_row.provider_reference = 'pi_rehearsal_c6_' || v_i and v_row.last_provider_result is null, 'case 6/' || v_case.name || ': capture evidence retained');
        select * into v_orow from public.research_orders where id = v_oid;
        perform pg_temp.expect(v_orow.state = 'checkout_pending' and v_orow.payment_reference is null and v_orow.captured_amount_cents is null, 'case 6/' || v_case.name || ': order untouched');
        select count(*) into v_count from public.research_order_state_events where order_id = v_oid;
        perform pg_temp.expect(v_count = 0, 'case 6/' || v_case.name || ': no state event');
        select count(*) into v_count from public.research_lot_reservations where reservation_id = any (v_case.ids) and status = 'finalized';
        perform pg_temp.expect(v_count = 0, 'case 6/' || v_case.name || ': no reservation finalized');
        -- A stale retry of the parked execution changes nothing more.
        select count(*) into v_count from public.research_checkout_execution_commit_captured(v_eid, 5, v_at);
        perform pg_temp.expect(v_count = 0, 'case 6/' || v_case.name || ': stale retry returns zero rows');
      end if;
    end loop;
  end;

  -- ---------------------------------------------------------------------
  -- Case 7: cancellation is two facts. Provider outcome (record_provider
  -- cancelled) then local settlement (commit_cancelled), each once.
  -- ---------------------------------------------------------------------
  declare
    v_oid uuid := '00000000-0000-4000-8000-00000000d001';
    v_eid uuid := '00000000-0000-4000-8000-00000000d101';
  begin
    insert into public.research_orders (id, member_id, state, subtotal_cents, shipping_cents, store_credit_applied_cents, total_cents, checkout_idempotency_key, created_at, updated_at)
    values (v_oid, v_member, 'checkout_pending', 4000, 0, 0, 4000, 'req_rehearsal_cancel', v_at, v_at);
    insert into public.research_order_lines (order_id, sku, display_name, quantity, unit_price_cents, line_total_cents, fulfillment_owner)
    values (v_oid, 'REH-D', 'Rehearsal D', 1, 4000, 4000, 'xenios');
    insert into public.research_lot_reservations (reservation_id, member_id, sku, quantity, status, expires_at) values ('res-reh-d', v_member, 'REH-D', 1, 'held', v_at + interval '1 hour');
    insert into public.research_checkout_executions
      (id, member_id, request_key, request_body_sha256, order_id, phase, version, provider_reference, amount_cents, payment_method_reference, quote_fingerprint,
       authorization_key, capture_key, cancel_key, reservation_ids, authorization_first_attempted_at, created_at)
    values
      (v_eid, v_member, 'req_rehearsal_cancel', v_digest, v_oid, 'authorized', 3, 'pi_rehearsal_cancel', 4000, 'pm_rehearsal_card', 'quote-d',
       'xr-auth-d', 'xr-capture-d', 'xr-cancel-d', array['res-reh-d'], v_at, v_at);
    -- Settlement before the provider outcome is refused.
    v_err := pg_temp.error_of(format($q$select * from public.research_checkout_execution_commit_cancelled(%L, 3, %L)$q$, v_eid, v_at));
    perform pg_temp.expect(v_err ilike '%not cancelled%', 'case 7: settlement before provider cancellation refused');
    select * into v_row from public.research_checkout_execution_claim(v_eid, 3, 'cancelling');
    perform pg_temp.expect(v_row.phase = 'cancelling' and v_row.version = 4, 'case 7: claim cancelling');
    -- Evidence that money was captured cannot settle as cancelled.
    select * into v_row from public.research_checkout_execution_record_provider(v_eid, 4, jsonb_build_object('kind','cancelled','providerReference','pi_rehearsal_cancel','capturedAmountCents',5));
    perform pg_temp.expect(v_row.phase = 'cancelled' and v_row.version = 5, 'case 7: cancelled recorded (bad evidence variant)');
    v_err := pg_temp.error_of(format($q$select * from public.research_checkout_execution_commit_cancelled(%L, 5, %L)$q$, v_eid, v_at));
    perform pg_temp.expect(v_err ilike '%zero-capture evidence%', 'case 7: non-zero capture evidence cannot settle as cancelled');
    -- Correct the evidence (a later read-back) and settle.
    select * into v_row from public.research_checkout_execution_record_provider(v_eid, 5, jsonb_build_object('kind','cancelled','providerReference','pi_rehearsal_cancel','capturedAmountCents',0));
    perform pg_temp.expect(v_row.phase = 'cancelled' and v_row.version = 6 and v_row.settled_at is null, 'case 7: cancelled recorded, not yet settled');
    select * into v_row from public.research_checkout_execution_commit_cancelled(v_eid, 6, v_at);
    perform pg_temp.expect(v_row.phase = 'cancelled' and v_row.version = 7 and v_row.settled_at = v_at, 'case 7: settled once');
    select * into v_orow from public.research_orders where id = v_oid;
    perform pg_temp.expect(v_orow.state = 'cancelled' and v_orow.last_idempotency_key = 'xr-cancel-d' and v_orow.payment_reference is null, 'case 7: order cancelled');
    select count(*) into v_count from public.research_lot_reservations where reservation_id = 'res-reh-d' and status = 'released' and released_at = v_at;
    perform pg_temp.expect(v_count = 1, 'case 7: hold released');
    select count(*) into v_count from public.research_order_state_events where order_id = v_oid and to_state = 'cancelled' and idempotency_key = 'xr-cancel-d';
    perform pg_temp.expect(v_count = 1, 'case 7: one cancellation state event');
    -- Settlement is idempotent: the same version returns the row unchanged; nothing is released twice.
    select * into v_row from public.research_checkout_execution_commit_cancelled(v_eid, 7, v_at + interval '1 minute');
    perform pg_temp.expect(v_row.version = 7 and v_row.settled_at = v_at, 'case 7: repeated settlement unchanged');
    select count(*) into v_count from public.research_order_state_events where order_id = v_oid;
    perform pg_temp.expect(v_count = 1, 'case 7: still one state event');
    select count(*) into v_count from public.research_checkout_execution_commit_cancelled(v_eid, 6, v_at);
    perform pg_temp.expect(v_count = 0, 'case 7: stale settlement returns zero rows');
  end;

  -- ---------------------------------------------------------------------
  -- Case 8: the webhook inbox receipt. One row per (provider, event id);
  -- the same id with other bytes cannot be inserted; the row moves to a
  -- terminal state once.
  -- ---------------------------------------------------------------------
  insert into public.research_payment_webhook_inbox (provider_name, event_id, event_type, payload_sha256, state, received_at)
  values ('stripe', 'evt_rehearsal_1', 'payment_intent.amount_capturable_updated', repeat('c', 64), 'processing', v_at);
  v_err := pg_temp.error_of($q$insert into public.research_payment_webhook_inbox (provider_name, event_id, event_type, payload_sha256)
    values ('stripe', 'evt_rehearsal_1', 'payment_intent.amount_capturable_updated', repeat('d', 64))$q$);
  perform pg_temp.expect(v_err ilike '%unique%' or v_err ilike '%duplicate key%', 'case 8: same event id twice refused');
  update public.research_payment_webhook_inbox set state = 'processed', outcome = 'applied', execution_id = v_exec, completed_at = v_at
   where provider_name = 'stripe' and event_id = 'evt_rehearsal_1';
  select count(*) into v_count from public.research_payment_webhook_inbox where provider_name = 'stripe' and event_id = 'evt_rehearsal_1' and state = 'processed' and execution_id = v_exec;
  perform pg_temp.expect(v_count = 1, 'case 8: receipt completed once');
  v_err := pg_temp.error_of($q$insert into public.research_payment_webhook_inbox (provider_name, event_id, event_type, payload_sha256, state)
    values ('stripe', 'evt_rehearsal_2', 'x', repeat('e', 64), 'done')$q$);
  perform pg_temp.expect(v_err is not null, 'case 8: unknown inbox state refused');

  -- ---------------------------------------------------------------------
  -- Case 9: another member cannot commit against this member's order (the
  -- function binds member_id on the order read).
  -- ---------------------------------------------------------------------
  insert into public.research_checkout_executions
    (id, member_id, request_key, request_body_sha256, order_id, phase, version, provider_reference, amount_cents, payment_method_reference, quote_fingerprint,
     authorization_key, capture_key, cancel_key, reservation_ids, authorization_first_attempted_at, created_at)
  values
    ('00000000-0000-4000-8000-00000000e009', v_other, 'req_rehearsal_other', v_digest, v_order2, 'captured', 5, 'pi_rehearsal_other', 5000, 'pm_rehearsal_card', 'quote-other',
     'xr-auth-other', 'xr-capture-other', 'xr-cancel-other', '{}', v_at, v_at);
  v_err := pg_temp.error_of(format($q$select * from public.research_checkout_execution_commit_captured(%L, 5, %L)$q$, '00000000-0000-4000-8000-00000000e009', v_at));
  perform pg_temp.expect(v_err ilike '%not the member''s order%', 'case 9: another member cannot commit this order');
  select * into v_orow from public.research_orders where id = v_order2;
  perform pg_temp.expect(v_orow.state = 'checkout_pending', 'case 9: order untouched');

  raise notice 'checkout executions rehearsal PASS';
end $rehearsal$;

-- Data-preserving by construction: nothing above survives.
rollback;
