-- Disposable PostgreSQL only. Run after the HL-12 concurrency fixture script.
begin;
do $proof$
declare
  v_request_id uuid := '10000000-0000-4000-8000-000000000011';
  v_member_id uuid := '20000000-0000-4000-8000-000000000011';
  v_observation_id uuid;
  v_quote jsonb;
  v_replay jsonb;
  v_paid_events bigint;
begin
  if has_function_privilege('service_role',
      'public.research_assisted_order_payment_verify(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role',
      'public.research_assisted_order_payment_verify_bound(uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon',
      'public.research_assisted_order_quote_get(text,uuid,text,text)', 'EXECUTE') then
    raise exception 'HL-12 bound finance RPC ACL failed';
  end if;
  if public.research_assisted_order_quote_get(
      'XRR-20260930-ABCDEF0011',
      '20000000-0000-4000-8000-000000000012'::uuid) is not null then
    raise exception 'Wrong owner viewed quote';
  end if;
  v_quote := public.research_assisted_order_quote_get(
    'XRR-20260930-ABCDEF0011', v_member_id);
  if v_quote ->> 'totalCents' <> '5000'
     or v_quote ->> 'currency' <> 'USD'
     or v_quote ->> 'state' <> 'accepted'
     or v_quote ? 'pricingBasis'
     or v_quote ->> 'requestId' <> v_request_id::text then
    raise exception 'Owner quote projection is wrong or leaks private basis';
  end if;
  select id into v_observation_id
  from public.research_assisted_order_payment_observations
  where request_id = v_request_id;
  select count(*) into v_paid_events
  from public.research_assisted_order_events
  where request_id = v_request_id and status = 'paid';
  if public.research_assisted_order_payment_verify_bound(
      '10000000-0000-4000-8000-000000000012'::uuid,
      v_observation_id,
      '40000000-0000-4000-8000-000000000011'::uuid) is not null then
    raise exception 'Wrong request path verified payment';
  end if;
  if (select count(*) from public.research_assisted_order_events
      where request_id = v_request_id and status = 'paid') <> v_paid_events then
    raise exception 'Wrong request path changed status';
  end if;
  v_replay := public.research_assisted_order_payment_verify_bound(
    v_request_id, v_observation_id,
    '40000000-0000-4000-8000-000000000011'::uuid);
  if v_replay ->> 'replayed' <> 'true'
     or v_replay ->> 'requestId' <> v_request_id::text then
    raise exception 'Correct bound payment verification replay failed';
  end if;
  raise notice 'HL-12 bound access PASS: owner projection, no private basis, wrong path no write, correct replay, ACL';
end
$proof$;
rollback;
