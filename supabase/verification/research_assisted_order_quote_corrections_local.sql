-- Disposable database only, after the existing concurrent-verification fixture.
-- Every new synthetic row in this proof is rolled back.
begin;
do $proof$
declare
  v_request uuid := '10000000-0000-4000-8000-000000000021';
  v_other uuid := '10000000-0000-4000-8000-000000000022';
  v_actor uuid := '40000000-0000-4000-8000-000000000011';
  v_member uuid := '20000000-0000-4000-8000-000000000011';
  v_ref text := 'XRR-20260930-ABCDEF0021';
  v_quote uuid;
  v_other_quote uuid;
  v_old uuid;
  v_new uuid;
  v_result jsonb;
  v_failed boolean;
  v_time timestamptz := now();
  v_index integer;
  v_id uuid;
  v_line uuid;
begin
  for v_index in 21..22 loop
    v_id := ('10000000-0000-4000-8000-0000000000' || v_index)::uuid;
    v_line := ('30000000-0000-4000-8000-0000000000' || v_index)::uuid;
    insert into public.research_assisted_order_requests (
      id, public_reference, idempotency_key_hash, request_fingerprint,
      actor_member_id, early_access_session_hash, normalized_email, full_legal_name, mobile_phone,
      shipping_address, billing_address, age_confirmed, source, status
    ) values (v_id, 'XRR-20260930-ABCDEF00' || v_index, 'correction-key-' || v_index,
      'correction-fp-' || v_index, null, 'synthetic-session-' || v_index, 'synthetic@example.test', 'Synthetic Buyer', '+10000000000',
      '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}'::jsonb,
      '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}'::jsonb,
      true, 'early_access_manual_order_bridge', 'reviewing');
    insert into public.research_assisted_order_lines (
      id, request_id, product_id, variant_id, product_name, quantity,
      minimum_quantity, quantity_increment, workflow_mode, customer_action_label,
      unit_price_cents, line_estimate_cents, catalog_version, authoritative_fingerprint
    ) values (v_line, v_id, 'P-SYNTHETIC', 'V-SYNTHETIC', 'Synthetic', 2, 1, 1,
      'direct_order_request', 'Request order', 2500, 5000, 'synthetic', 'synthetic');
    v_result := public.research_assisted_order_quote_issue(v_id,
      jsonb_build_array(jsonb_build_object('lineId', v_line)), now() + interval '1 day', 'synthetic');
    v_quote := (v_result ->> 'quoteId')::uuid;
    -- Nullable owner fields must not accidentally authorize another member.
    if public.research_assisted_order_quote_accept(v_quote, 1, 5000, v_member) is not null then
      raise exception 'NULL owner accepted a foreign quote';
    end if;
    update public.research_assisted_order_requests set actor_member_id = v_member where id = v_id;
    v_failed := false;
    begin
      perform public.research_assisted_order_quote_accept(v_quote, null, null, v_member);
    exception when sqlstate 'P0001' then v_failed := true;
    end;
    if not v_failed then raise exception 'NULL acceptance echo accepted'; end if;
    perform public.research_assisted_order_quote_accept(v_quote, 1, 5000, v_member);
    perform public.research_assisted_order_set_status(v_id, 'reviewing', 'payment_pending', 'synthetic', 'admin');
    perform public.research_assisted_order_set_status(v_id, 'payment_pending', 'payment_review', 'synthetic', 'admin');
  end loop;
  select id into v_quote from public.research_assisted_order_quotes where request_id = v_request;
  select id into v_other_quote from public.research_assisted_order_quotes where request_id = v_other;
  v_old := (public.research_assisted_order_payment_observe(v_request, v_quote, 'manual',
    4999, 'USD', v_ref, 'synthetic:bank:correction', v_time, v_actor) ->> 'observationId')::uuid;
  v_failed := false;
  begin
    perform public.research_assisted_order_payment_verify_bound(v_request, v_old, v_actor);
  exception when sqlstate 'P0001' then v_failed := true;
  end;
  if not v_failed then raise exception 'Wrong amount verified'; end if;
  v_failed := false;
  begin
    perform public.research_assisted_order_payment_correct_manual(v_request, v_old, v_member,
      v_quote, v_ref, 5000, 'USD', 'synthetic:bank:correction', v_time, 'Corrected import amount');
  exception when sqlstate 'P0001' then v_failed := true;
  end;
  if not v_failed then raise exception 'Ungrant-ed actor corrected observation'; end if;
  -- Interrupt after a valid correction; neither its link nor replacement survives.
  begin
    perform public.research_assisted_order_payment_correct_manual(v_request, v_old, v_actor,
      v_quote, v_ref, 5000, 'USD', 'synthetic:bank:rollback', v_time, 'Synthetic interrupted correction');
    raise exception 'synthetic interruption' using errcode = 'P0002';
  exception when sqlstate 'P0002' then null;
  end;
  if exists (select 1 from public.research_assisted_order_observation_corrections where observation_id = v_old)
    or exists (select 1 from public.research_assisted_order_evidence_claims where evidence_ref = 'synthetic:bank:rollback') then
    raise exception 'Interrupted correction leaked partial writes';
  end if;
  v_result := public.research_assisted_order_payment_correct_manual(v_request, v_old, v_actor,
    v_quote, v_ref, 5000, 'USD', 'synthetic:bank:correction', v_time, 'Corrected import amount');
  v_new := (v_result ->> 'observationId')::uuid;
  if v_new = v_old or v_result ->> 'replayed' <> 'false' then raise exception 'Correction did not append'; end if;
  v_result := public.research_assisted_order_payment_correct_manual(v_request, v_old, v_actor,
    v_quote, v_ref, 5000, 'USD', 'synthetic:bank:correction', v_time, 'Corrected import amount');
  if v_result ->> 'replayed' <> 'true' or (v_result ->> 'observationId')::uuid <> v_new then
    raise exception 'Correction replay not stable';
  end if;
  if (select observed_amount_cents from public.research_assisted_order_payment_observations where id = v_old) <> 4999 then
    raise exception 'Original observation changed';
  end if;
  v_failed := false;
  begin
    perform public.research_assisted_order_payment_observe(v_other, v_other_quote, 'manual',
      5000, 'USD', 'XRR-20260930-ABCDEF0022', 'synthetic:bank:correction', v_time, v_actor);
  exception when sqlstate 'P0001' then v_failed := true;
  end;
  if not v_failed then raise exception 'Bank evidence reused across orders'; end if;
  v_failed := false;
  begin
    perform public.research_assisted_order_set_status(v_request, 'payment_review', 'cancelled',
      'synthetic', 'admin', null, null, '{"cancellationReason":"Free text is not a refund"}'::jsonb);
  exception when sqlstate 'P0001' then v_failed := true;
  end;
  if not v_failed then raise exception 'Observed money cancelled with free text'; end if;
  perform public.research_assisted_order_payment_verify_bound(v_request, v_new, v_actor);
  if not (public.research_assisted_order_financial_state(v_request) ->> 'paymentVerified')::boolean then
    raise exception 'Verified financial projection absent';
  end if;
  v_failed := false;
  begin
    perform public.research_assisted_order_payment_correct_manual(v_request, v_new, v_actor,
      v_quote, v_ref, 4999, 'USD', 'synthetic:bank:correction', v_time, 'Not a valid reversal');
  exception when sqlstate 'P0001' then v_failed := true;
  end;
  if not v_failed then raise exception 'Verified payment corrected as observation'; end if;
  -- Opposite cancellation interleaving: clean cancellation wins, later observe denied.
  perform public.research_assisted_order_set_status(v_other, 'payment_review', 'cancelled',
    'synthetic', 'admin', null, null, '{"cancellationReason":"No money observed"}'::jsonb);
  v_failed := false;
  begin
    perform public.research_assisted_order_payment_observe(v_other, v_other_quote, 'manual',
      5000, 'USD', 'XRR-20260930-ABCDEF0022', 'synthetic:bank:late', v_time, v_actor);
  exception when sqlstate 'P0001' then v_failed := true;
  end;
  if not v_failed then raise exception 'Cancelled order accepted a new payment observation'; end if;
  if has_function_privilege('anon', 'public.research_assisted_order_payment_correct_manual(uuid,uuid,uuid,uuid,text,bigint,text,text,timestamptz,text)', 'EXECUTE')
    or has_table_privilege('service_role', 'public.research_assisted_order_evidence_claims', 'INSERT') then
    raise exception 'Financial correction ACL wrong';
  end if;
  raise notice 'HL-12 corrections PASS: ownership NULL, acceptance NULL, wrong amount/actor, atomic interruption, append-only correction/replay, cross-order single use, verified immutability, cancellation interleavings and ACL';
end
$proof$;
set constraints all immediate;
rollback;
