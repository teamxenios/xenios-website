-- Run after M71, the HL-26 guard, the paid hold, and the new HL-12 source
-- migration on a disposable PostgreSQL database. All fixture writes roll back.
begin;

do $proof$
declare
  v_request_id uuid := '10000000-0000-4000-8000-000000000001';
  v_member_id uuid := '20000000-0000-4000-8000-000000000001';
  v_priced_line uuid := '30000000-0000-4000-8000-000000000001';
  v_quote_only_line uuid := '30000000-0000-4000-8000-000000000002';
  v_decisions jsonb;
  v_quote jsonb;
  v_accept jsonb;
  v_replay jsonb;
  v_failed boolean;
  v_observation_id uuid;
  v_verification_id uuid;
  v_observation jsonb;
  v_verified jsonb;
  v_finance_actor uuid := '40000000-0000-4000-8000-000000000001';
  v_bad_observation uuid;
begin
  if has_table_privilege('anon', 'public.research_assisted_order_quotes', 'SELECT')
     or has_table_privilege('authenticated', 'public.research_assisted_order_payment_observations', 'SELECT')
     or has_table_privilege('service_role', 'public.research_assisted_order_payment_verifications', 'INSERT') then
    raise exception 'HL-12 private financial table has a client or direct service grant';
  end if;
  if has_function_privilege('anon', 'public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.research_assisted_order_quote_accept(uuid,integer,bigint,uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)', 'EXECUTE') then
    raise exception 'HL-12 quote RPC ACL is wrong';
  end if;

  insert into public.research_assisted_order_requests (
    id, public_reference, idempotency_key_hash, request_fingerprint,
    actor_member_id, normalized_email, full_legal_name, mobile_phone,
    shipping_address, billing_address, age_confirmed, source, status
  ) values (
    v_request_id, 'XRR-20260930-ABCDEF1234', 'synthetic-hl12-key', 'synthetic-hl12-fingerprint',
    v_member_id, 'synthetic@example.test', 'Synthetic Buyer', '+10000000000',
    '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}'::jsonb,
    '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}'::jsonb,
    true, 'early_access_manual_order_bridge', 'reviewing'
  );
  insert into public.research_assisted_order_lines (
    id, request_id, product_id, variant_id, product_name, quantity,
    minimum_quantity, quantity_increment, workflow_mode, customer_action_label,
    unit_price_cents, line_estimate_cents, catalog_version, authoritative_fingerprint
  ) values
    (v_priced_line, v_request_id, 'P1', 'V1', 'Priced synthetic', 2,
      1, 1, 'direct_order_request', 'Request order', 2500, 5000, 'cat-1', 'fp-1'),
    (v_quote_only_line, v_request_id, 'P2', 'V2', 'Quote synthetic', 1,
      1, 1, 'request_pricing', 'Request price', null, null, 'cat-1', 'fp-2');

  v_decisions := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('lineId', v_priced_line),
    pg_catalog.jsonb_build_object('lineId', v_quote_only_line,
      'unitPriceCents', 1200, 'pricingBasis', 'synthetic reviewer basis')
  );
  v_quote := public.research_assisted_order_quote_issue(
    v_request_id, v_decisions, now() + interval '1 day', 'synthetic-admin');
  if (v_quote ->> 'totalCents')::bigint <> 6200
     or (v_quote -> 'lines' -> 0 ->> 'unitPriceCents')::bigint <> 2500
     or v_quote::text like '%synthetic reviewer basis%' then
    raise exception 'Quote total, authoritative price or customer projection is wrong';
  end if;

  v_failed := false;
  begin
    perform public.research_assisted_order_quote_issue(
      v_request_id,
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('lineId', v_priced_line, 'unitPriceCents', 1),
        pg_catalog.jsonb_build_object('lineId', v_quote_only_line,
          'unitPriceCents', 1200, 'pricingBasis', 'synthetic reviewer basis')),
      now() + interval '1 day', 'synthetic-admin');
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'Priced line tampering succeeded'; end if;

  if public.research_assisted_order_quote_accept(
      (v_quote ->> 'quoteId')::uuid, 1, 6200,
      '20000000-0000-4000-8000-000000000002'::uuid) is not null then
    raise exception 'Wrong owner accepted the quote';
  end if;
  v_failed := false;
  begin
    perform public.research_assisted_order_quote_accept(
      (v_quote ->> 'quoteId')::uuid, 1, 6201, v_member_id);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'Wrong total accepted'; end if;

  v_accept := public.research_assisted_order_quote_accept(
    (v_quote ->> 'quoteId')::uuid, 1, 6200, v_member_id);
  v_replay := public.research_assisted_order_quote_accept(
    (v_quote ->> 'quoteId')::uuid, 1, 6200, v_member_id);
  if v_accept ->> 'acceptanceId' is null
     or v_accept ->> 'replayed' <> 'false'
     or v_replay ->> 'replayed' <> 'true'
     or v_replay ->> 'acceptanceId' <> v_accept ->> 'acceptanceId' then
    raise exception 'Quote acceptance or replay failed';
  end if;
  v_bad_observation := (public.research_assisted_order_payment_observe(
    v_request_id, (v_quote ->> 'quoteId')::uuid, 'provider', 6199, 'USD',
    'pi_wrong_amount', 'synthetic-provider-evidence-a', now(), null,
    'synthetic-provider', 'evt_wrong_amount', 'pi_wrong_amount') ->> 'observationId')::uuid;
  v_failed := false;
  begin
    perform public.research_assisted_order_payment_verify(v_bad_observation);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'Wrong provider amount verified'; end if;
  v_bad_observation := (public.research_assisted_order_payment_observe(
    v_request_id, (v_quote ->> 'quoteId')::uuid, 'provider', 6200, 'EUR',
    'pi_wrong_currency', 'synthetic-provider-evidence-b', now(), null,
    'synthetic-provider', 'evt_wrong_currency', 'pi_wrong_currency') ->> 'observationId')::uuid;
  v_failed := false;
  begin
    perform public.research_assisted_order_payment_verify(v_bad_observation);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'Wrong provider currency verified'; end if;
  v_failed := false;
  begin
    perform public.research_assisted_order_payment_observe(
      v_request_id, (v_quote ->> 'quoteId')::uuid, 'provider', 6200, 'USD',
      'pi_reused_event', 'synthetic-provider-evidence-c', now(), null,
      'synthetic-provider', 'evt_wrong_currency', 'pi_reused_event');
  exception when unique_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'Provider event was reused'; end if;
  v_failed := false;
  begin
    perform public.research_assisted_order_payment_observe(
      v_request_id, (v_quote ->> 'quoteId')::uuid, 'manual', 6200, 'USD',
      'XRR-20260930-ABCDEF1234', 'synthetic-bank-ledger-line-1', now(),
      v_finance_actor);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'Ungranted manual actor recorded money'; end if;
  insert into public.research_assisted_order_payment_verifier_grants (
    auth_user_id, actor_label, granted_by
  ) values (v_finance_actor, 'synthetic-finance-operator', 'synthetic-founder');
  v_observation := public.research_assisted_order_payment_observe(
    v_request_id, (v_quote ->> 'quoteId')::uuid, 'manual', 6200, 'USD',
    'XRR-20260930-ABCDEF1234', 'synthetic-bank-ledger-line-1', now(),
    v_finance_actor);
  v_observation_id := (v_observation ->> 'observationId')::uuid;
  if v_observation ->> 'replayed' <> 'false'
     or (public.research_assisted_order_payment_observe(
        v_request_id, (v_quote ->> 'quoteId')::uuid, 'manual', 6200, 'USD',
        'XRR-20260930-ABCDEF1234', 'synthetic-bank-ledger-line-1', now(),
        v_finance_actor) ->> 'replayed') <> 'true' then
    raise exception 'Manual observation replay failed';
  end if;
  v_failed := false;
  begin
    insert into public.research_assisted_order_payment_verifications (
      request_id, quote_id, quote_version, acceptance_id, observation_id,
      expected_amount_cents, expected_currency, observed_amount_cents,
      observed_currency, payment_reference, method, verified_by
    ) values (
      v_request_id, (v_quote ->> 'quoteId')::uuid, 1,
      (v_accept ->> 'acceptanceId')::uuid, v_observation_id,
      6200, 'USD', 6201, 'USD', 'XRR-20260930-ABCDEF1234', 'manual',
      'synthetic-finance-operator'
    );
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'Wrong amount verification inserted'; end if;
  perform public.research_assisted_order_set_status(
    v_request_id, 'reviewing', 'payment_pending', 'synthetic-admin', 'admin');
  perform public.research_assisted_order_set_status(
    v_request_id, 'payment_pending', 'payment_review', 'synthetic-admin', 'admin');
  v_failed := false;
  begin
    perform public.research_assisted_order_set_status(
      v_request_id, 'payment_review', 'paid', 'synthetic-admin', 'admin',
      null, null,
      '{"paymentVerificationId":"50000000-0000-4000-8000-000000000001"}'::jsonb);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'Typed verification id marked paid'; end if;
  v_failed := false;
  begin
    insert into public.research_assisted_order_payment_verifications (
      request_id, quote_id, quote_version, acceptance_id, observation_id,
      expected_amount_cents, expected_currency, observed_amount_cents,
      observed_currency, payment_reference, method, verified_by
    ) values (
      v_request_id, (v_quote ->> 'quoteId')::uuid, 1,
      (v_accept ->> 'acceptanceId')::uuid, v_observation_id,
      6200, 'USD', 6200, 'USD', 'XRR-20260930-ABCDEF1234', 'manual',
      'synthetic-finance-operator'
    );
    perform public.research_assisted_order_set_status(
      v_request_id, 'payment_review', 'paid', 'synthetic-admin', 'admin',
      null, null,
      '{"paymentVerificationId":"50000000-0000-4000-8000-000000000001"}'::jsonb);
  exception when others then v_failed := true;
  end;
  if not v_failed or exists (
    select 1 from public.research_assisted_order_payment_verifications
    where request_id = v_request_id
  ) or (select status from public.research_assisted_order_requests
        where id = v_request_id) <> 'payment_review' then
    raise exception 'Interrupted/wrong-id paid write did not roll back atomically';
  end if;
  v_failed := false;
  begin
    perform public.research_assisted_order_payment_verify(
      v_observation_id, '40000000-0000-4000-8000-000000000002'::uuid);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'Wrong verifier marked paid'; end if;
  v_verified := public.research_assisted_order_payment_verify(
    v_observation_id, v_finance_actor);
  v_verification_id := (v_verified ->> 'verificationId')::uuid;
  if v_verified ->> 'state' <> 'paid' or v_verified ->> 'replayed' <> 'false'
     or (select status from public.research_assisted_order_requests where id = v_request_id) <> 'paid'
     or (select count(*) from public.research_assisted_order_events
         where request_id = v_request_id and status = 'paid'
           and evidence ->> 'paymentVerificationId' = v_verification_id::text) <> 1 then
    raise exception 'Atomic paid transition failed';
  end if;
  if (public.research_assisted_order_payment_verify(
        v_observation_id, v_finance_actor) ->> 'replayed') <> 'true' then
    raise exception 'Paid verification replay failed';
  end if;
  v_failed := false;
  begin
    update public.research_assisted_order_payment_verifications
    set verified_by = 'tampered' where id = v_verification_id;
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'Verification was mutable'; end if;
  v_failed := false;
  begin
    insert into public.research_assisted_order_payment_observations (
      request_id, quote_id, method, observed_amount_cents, observed_currency,
      payment_reference, source_evidence_ref, observed_by, observed_at
    ) values (
      v_request_id, (v_quote ->> 'quoteId')::uuid, 'manual', 6200, 'USD',
      'XRR-20260930-ABCDEF1234', 'synthetic-bank-ledger-line-2',
      'synthetic-finance-operator', now()
    );
  exception when unique_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'Payment reference reused'; end if;
  raise notice 'HL-12 quote foundation PASS: exact lines/total, owner, stale total, replay, ACL';
  raise notice 'HL-12 evidence schema PASS: amount constraint, unique reference, append-only verification';
  raise notice 'HL-12 paid transition PASS: typed ID denied, wrong actor denied, interrupted write rollback, atomic exact verification, replay';
  raise notice 'HL-12 mismatch PASS: wrong provider amount/currency and reused event denied';
end
$proof$;

rollback;
