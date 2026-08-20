-- M75 behavioural verification. NOT a syntax check.
--
-- Every assertion below exercises the routine the way a runtime does and fails
-- the script loudly if the answer is wrong. Run it AFTER each apply, on each
-- engine, so "applied twice" means the behaviour survived twice.
--
-- The two compatibility claims this file exists to prove:
--   OLD RUNTIME + NEW MIGRATION -> existing Early Access still works
--   NEW RUNTIME + NEW MIGRATION -> the typed code persists

\set ON_ERROR_STOP on

do $verify$
declare
  v_result jsonb;
  v_code text;
  v_state text;
  v_ref text;
  v_id uuid;
  v_count integer;
  v_acl text;

  -- One payload builder, so old-runtime and new-runtime cases differ ONLY by
  -- the two keys under test.
  function_payload jsonb;
begin
  -- ==========================================================================
  -- 1. OLD RUNTIME COMPATIBILITY. The exact payload shape the CURRENT
  --    production runtime sends: no declaredAffiliateCode, no state key.
  --    This is the case that must not break during the migrate-then-deploy
  --    window, when the new schema is live and the old code is still serving.
  -- ==========================================================================
  v_id := gen_random_uuid();
  function_payload := jsonb_build_object(
    'requestId', v_id,
    'publicReference', 'XRR-20260820-OLD0000001',
    'idempotencyKeyHash', 'hash-old-runtime-1',
    'requestFingerprint', 'fp-old-1',
    'earlyAccessSessionHash', repeat('a', 64),
    'normalizedEmail', 'old@example.com',
    'fullLegalName', 'Old Runtime',
    'mobilePhone', '+15125550100',
    'shippingAddress', jsonb_build_object('line1', '1 Test', 'city', 'Austin', 'region', 'TX', 'postalCode', '78704', 'countryCode', 'US'),
    'billingAddress', jsonb_build_object('line1', '1 Test', 'city', 'Austin', 'region', 'TX', 'postalCode', '78704', 'countryCode', 'US'),
    'ageConfirmed', true,
    'agreements', '[]'::jsonb,
    'estimatedTotalCents', 10000,
    'currency', 'USD',
    'source', 'early_access_manual_order_bridge',
    'statusTokenHash', 'token-old-1',
    'createdAt', now()::text,
    'lines', jsonb_build_array(jsonb_build_object(
      'lineId', gen_random_uuid(),
      'productId', 'pc-prod-1', 'variantId', 'pc-var-1', 'productName', 'BPC-157',
      'quantity', 2, 'minimumQuantity', 1, 'quantityIncrement', 1,
      'workflowMode', 'direct_order_request', 'customerActionLabel', 'Request order',
      'unitPriceCents', 5000, 'lineEstimateCents', 10000, 'currency', 'USD',
      'catalogVersion', 'v1', 'authoritativeFingerprint', 'fp-line-1'
    ))
  );

  v_result := public.research_assisted_order_submit(function_payload);
  if v_result is null or v_result -> 'receipt' ->> 'publicReference' <> 'XRR-20260820-OLD0000001' then
    raise exception 'M75 verify: an OLD-runtime payload did not produce its receipt';
  end if;

  select declared_affiliate_code, declared_affiliate_code_state
    into v_code, v_state
  from public.research_assisted_order_requests where id = v_id;
  if v_code is not null or v_state <> 'not_provided' then
    raise exception 'M75 verify: old-runtime row should be (null, not_provided), got (%, %)', v_code, v_state;
  end if;

  -- ==========================================================================
  -- 2. NEW RUNTIME. The typed code persists, exactly as normalized.
  -- ==========================================================================
  v_id := gen_random_uuid();
  function_payload := jsonb_set(function_payload, '{requestId}', to_jsonb(v_id));
  function_payload := jsonb_set(function_payload, '{publicReference}', '"XRR-20260820-NEW0000001"');
  function_payload := jsonb_set(function_payload, '{idempotencyKeyHash}', '"hash-new-runtime-1"');
  function_payload := jsonb_set(function_payload, '{statusTokenHash}', '"token-new-1"');
  function_payload := function_payload
    || jsonb_build_object('declaredAffiliateCode', 'DANA10', 'declaredAffiliateCodeState', 'captured_unmatched');

  v_result := public.research_assisted_order_submit(function_payload);
  select declared_affiliate_code, declared_affiliate_code_state
    into v_code, v_state
  from public.research_assisted_order_requests where id = v_id;
  if v_code <> 'DANA10' or v_state <> 'captured_unmatched' then
    raise exception 'M75 verify: typed code did not persist, got (%, %)', v_code, v_state;
  end if;

  -- ==========================================================================
  -- 3. A MALFORMED CODE MUST NOT COST THE CUSTOMER THEIR ORDER.
  --    The shape CHECK would abort the insert if the routine passed junk
  --    through, so this is the assertion that proves sanitizing, not aborting.
  -- ==========================================================================
  v_id := gen_random_uuid();
  function_payload := jsonb_set(function_payload, '{requestId}', to_jsonb(v_id));
  function_payload := jsonb_set(function_payload, '{publicReference}', '"XRR-20260820-BAD0000001"');
  function_payload := jsonb_set(function_payload, '{idempotencyKeyHash}', '"hash-bad-1"');
  function_payload := jsonb_set(function_payload, '{statusTokenHash}', '"token-bad-1"');
  function_payload := jsonb_set(function_payload, '{declaredAffiliateCode}', '"<script>alert(1)</script>"');

  v_result := public.research_assisted_order_submit(function_payload);
  if v_result -> 'receipt' ->> 'publicReference' <> 'XRR-20260820-BAD0000001' then
    raise exception 'M75 verify: a malformed code blocked the order';
  end if;
  select declared_affiliate_code, declared_affiliate_code_state
    into v_code, v_state
  from public.research_assisted_order_requests where id = v_id;
  if v_code is not null or v_state <> 'invalid_ignored' then
    raise exception 'M75 verify: malformed code should be (null, invalid_ignored), got (%, %)', v_code, v_state;
  end if;

  -- ==========================================================================
  -- 4. NO CALLER MAY SUBMIT A MATCHED CODE. Matching is an operator act; a
  --    payload that claims it must be downgraded, or a typed string could
  --    present itself as a settled commercial relationship.
  -- ==========================================================================
  v_id := gen_random_uuid();
  function_payload := jsonb_set(function_payload, '{requestId}', to_jsonb(v_id));
  function_payload := jsonb_set(function_payload, '{publicReference}', '"XRR-20260820-MTC0000001"');
  function_payload := jsonb_set(function_payload, '{idempotencyKeyHash}', '"hash-matched-1"');
  function_payload := jsonb_set(function_payload, '{statusTokenHash}', '"token-matched-1"');
  function_payload := jsonb_set(function_payload, '{declaredAffiliateCode}', '"DANA10"');
  function_payload := jsonb_set(function_payload, '{declaredAffiliateCodeState}', '"matched_manual"');

  v_result := public.research_assisted_order_submit(function_payload);
  select declared_affiliate_code_state into v_state
  from public.research_assisted_order_requests where id = v_id;
  if v_state <> 'captured_unmatched' then
    raise exception 'M75 verify: a payload claimed matched_manual and it was accepted as %', v_state;
  end if;

  -- ==========================================================================
  -- 5. THE TYPED CODE NEVER BECOMES VERIFIED ATTRIBUTION.
  -- ==========================================================================
  select affiliate_attribution_ref into v_ref
  from public.research_assisted_order_requests where id = v_id;
  if v_ref is not null then
    raise exception 'M75 verify: verified attribution was written from a payload that only carried a typed code';
  end if;

  -- ==========================================================================
  -- 6. IDEMPOTENCY IS UNCHANGED. A replay returns the incumbent rather than a
  --    second row, and does not rewrite the stored code.
  -- ==========================================================================
  v_result := public.research_assisted_order_submit(
    jsonb_set(function_payload, '{declaredAffiliateCode}', '"SOMEONEELSE"')
  );
  select count(*) into v_count
  from public.research_assisted_order_requests where idempotency_key_hash = 'hash-matched-1';
  if v_count <> 1 then
    raise exception 'M75 verify: replay produced % rows', v_count;
  end if;
  select declared_affiliate_code into v_code
  from public.research_assisted_order_requests where idempotency_key_hash = 'hash-matched-1';
  if v_code <> 'DANA10' then
    raise exception 'M75 verify: a replay rewrote the stored code to %', v_code;
  end if;

  -- ==========================================================================
  -- 7. THE BOUNDARY. No client role may execute the routine, and row level
  --    security on the requests table is still enabled AND forced.
  -- ==========================================================================
  select coalesce(array_to_string(p.proacl, ','), '') into v_acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'research_assisted_order_submit';
  if v_acl like '%anon=%' or v_acl like '%authenticated=%' or v_acl like '%=X/%' then
    raise exception 'M75 verify: submit routine reachable by a client role: %', v_acl;
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'research_assisted_order_requests'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'M75 verify: row level security is not enabled and forced';
  end if;

  -- ==========================================================================
  -- 8. THE CONSTRAINTS REALLY BITE. A direct write that disagrees with itself
  --    must be refused, so the column pair cannot drift through some other
  --    path later.
  -- ==========================================================================
  begin
    update public.research_assisted_order_requests
       set declared_affiliate_code_state = 'matched_manual', declared_affiliate_code = null
     where idempotency_key_hash = 'hash-matched-1';
    raise exception 'M75 verify: a matched state with no code was accepted';
  exception when check_violation then
    null; -- expected
  end;

  raise notice 'M75 behavioural verification: all assertions passed';
end
$verify$;
