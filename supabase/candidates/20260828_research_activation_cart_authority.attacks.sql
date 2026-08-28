\set ON_ERROR_STOP on

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if p_condition is distinct from true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end
$function$;

select pg_temp.assert_true(
  public.research_activation_evidence_fingerprint_v1(
    1::smallint, 99::bigint,
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'XR-ATOMIC-1', 'live', 'live',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'founder',
    '2026-08-20T01:02:03.004Z',
    '2026-08-20T02:02:03.004Z',
    '2026-08-20T03:02:03.004Z',
    '2026-09-20T03:02:03.004Z',
    null
  ) = 'sha256:97846b2184fd67ee5ce2cec92070cd54839db12cc4134a3f6e469f86214ab8ca',
  'SQL evidence fingerprint drifted from the TypeScript canonical payload'
);

insert into public.research_products(
  id, sku, display_name, availability, commerce_approval,
  admin_status, active_state, visibility_state, version
) values (
  '10000000-0000-4000-8000-000000000001',
  'XR-ATOMIC-1',
  'Atomic Authority Test Product',
  'in_stock', 'approved', 'published', true, 'members_only', 7
);

insert into public.research_product_variants(
  id, product_id, sku, label, member_eligible, status, active, version,
  created_by, updated_by
) values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'XR-ATOMIC-1', 'Atomic Variant', true, 'approved', true, 11,
  'rehearsal', 'rehearsal'
);

insert into public.research_product_variant_activation_revisions(
  product_id, variant_id, sku, product_revision, variant_revision,
  product_state, variant_state, approval_id, approved_by_actor_id,
  approved_by_role, approved_at, reviewed_at, valid_from, valid_through
) values (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'XR-ATOMIC-1', 7, 11, 'live', 'live',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'founder',
  clock_timestamp() - interval '4 days',
  clock_timestamp() - interval '3 days',
  clock_timestamp() - interval '2 days',
  clock_timestamp() + interval '2 days'
) returning ledger_revision as live_revision \gset

insert into public.research_product_variant_activation_heads(
  sku, product_id, variant_id, ledger_revision
) values (
  'XR-ATOMIC-1',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  :live_revision
);

-- No direct candidate table authority is granted to any API role. Only the two
-- reviewed entry RPCs are callable by service_role; lifecycle helpers are for
-- composition inside SECURITY DEFINER checkout commands.
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.research_checkout_activation_intents', 'select'),
  'anon unexpectedly reads intents'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.research_product_variant_activation_revisions', 'select'),
  'authenticated unexpectedly reads activation revisions'
);
select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.research_cart_line_activation_authority', 'insert'),
  'service_role unexpectedly writes authority sidecars directly'
);
select pg_temp.assert_true(
  has_function_privilege(
    'service_role',
    'public.research_cart_mutate_with_activation_v1(uuid,text,text,integer,text,integer,timestamptz,integer)',
    'execute'
  ),
  'service_role lacks the cart command'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'service_role',
    'public.research_checkout_activation_intent_consume_v1(uuid,text,uuid,uuid,text,timestamptz)',
    'execute'
  ),
  'service_role can invoke the internal consume helper directly'
);

set role service_role;
select public.research_cart_mutate_with_activation_v1(
  '50000000-0000-4000-8000-000000000001',
  'add', 'XR-ATOMIC-1', 1, 'one_time', null,
  clock_timestamp(), 10
) as add_result \gset
reset role;

select pg_temp.assert_true((:'add_result'::jsonb->>'ok')::boolean, 'live add was refused');
select pg_temp.assert_true(
  (:'add_result'::jsonb->>'cartVersion')::bigint = 2,
  'first atomic cart mutation did not publish version 2'
);
select pg_temp.assert_true(
  :'add_result'::jsonb#>>'{authority,activationLedgerRevision}' = :'live_revision',
  'cart authority did not bind the exact live ledger revision'
);
select pg_temp.assert_true(
  :'add_result'::jsonb#>>'{authority,bindingFingerprint}' =
    'sha256:b8bc6a9731781cfe04f1b83e415a0a504e43a8683ca0c52d249256319502a519',
  'SQL binding fingerprint drifted from the TypeScript canonical payload'
);
select pg_temp.assert_true(
  (select quantity = 1 from public.research_cart_lines l
   join public.research_carts c on c.id = l.cart_id
   where c.member_id = '50000000-0000-4000-8000-000000000001'
     and l.sku = 'XR-ATOMIC-1'),
  'successful add did not commit exactly one line'
);

-- Every denial below must precede mutation.
set role service_role;
select public.research_cart_mutate_with_activation_v1(
  '50000000-0000-4000-8000-000000000001',
  'add', 'MISSING-SKU', 1, 'one_time', null,
  clock_timestamp(), 10
) as missing_result \gset
select public.research_cart_mutate_with_activation_v1(
  '50000000-0000-4000-8000-000000000001',
  'add', 'XR-ATOMIC-1', 10, 'one_time', null,
  clock_timestamp(), 10
) as overflow_result \gset
reset role;
select pg_temp.assert_true(
  :'missing_result'::jsonb = '{"ok":false,"code":"activation_not_live"}'::jsonb,
  'missing SKU did not fail closed'
);
select pg_temp.assert_true(
  :'overflow_result'::jsonb = '{"ok":false,"code":"quantity_invalid"}'::jsonb,
  'overflow did not fail closed'
);
select pg_temp.assert_true(
  (select quantity = 1 from public.research_cart_lines l
   join public.research_carts c on c.id = l.cart_id
   where c.member_id = '50000000-0000-4000-8000-000000000001'
     and l.sku = 'XR-ATOMIC-1'),
  'a denial mutated cart quantity'
);
select pg_temp.assert_true(
  (select version = 2 from public.research_cart_activation_versions av
   join public.research_carts c on c.id = av.cart_id
   where c.member_id = '50000000-0000-4000-8000-000000000001'),
  'a denial advanced cart version'
);

-- A held head is current evidence but not live evidence. It denies without
-- changing the already-committed cart.
insert into public.research_product_variant_activation_revisions(
  product_id, variant_id, sku, product_revision, variant_revision,
  product_state, variant_state, approval_id, approved_by_actor_id,
  approved_by_role, approved_at, reviewed_at, valid_from, valid_through
) values (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'XR-ATOMIC-1', 7, 11, 'held', 'live',
  '30000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',
  'founder', clock_timestamp() - interval '4 days',
  clock_timestamp() - interval '3 days', clock_timestamp() - interval '2 days',
  clock_timestamp() + interval '2 days'
) returning ledger_revision as held_revision \gset
update public.research_product_variant_activation_heads
set ledger_revision = :held_revision, appointed_at = clock_timestamp()
where sku = 'XR-ATOMIC-1';

set role service_role;
select public.research_cart_mutate_with_activation_v1(
  '50000000-0000-4000-8000-000000000001',
  'set_quantity', 'XR-ATOMIC-1', 2, null, null,
  clock_timestamp(), 10
) as held_result \gset
reset role;
select pg_temp.assert_true(
  :'held_result'::jsonb = '{"ok":false,"code":"activation_not_live"}'::jsonb,
  'held activation did not refuse'
);
select pg_temp.assert_true(
  (select quantity = 1 from public.research_cart_lines l
   join public.research_carts c on c.id = l.cart_id
   where c.member_id = '50000000-0000-4000-8000-000000000001'),
  'held denial mutated cart'
);
update public.research_product_variant_activation_heads
set ledger_revision = :live_revision, appointed_at = clock_timestamp()
where sku = 'XR-ATOMIC-1';

-- Precharge freezes the exact cart + line revisions, then claim binds one
-- immutable checkout command before provider I/O.
set role service_role;
select public.research_checkout_activation_precharge_authorize_v1(
  '50000000-0000-4000-8000-000000000001',
  repeat('a', 64), clock_timestamp(), 1
) as authorize_result \gset
reset role;
select pg_temp.assert_true(
  (:'authorize_result'::jsonb->>'ok')::boolean,
  'precharge authorization failed'
);
select :'authorize_result'::jsonb#>>'{authorization,intentId}' as intent_id,
       :'authorize_result'::jsonb#>>'{authorization,cartFingerprint}' as cart_fingerprint \gset

select public.research_checkout_activation_intent_claim_v1(
  '50000000-0000-4000-8000-000000000001', repeat('a',64),
  :'intent_id'::uuid,
  '60000000-0000-4000-8000-000000000001',
  :'cart_fingerprint', clock_timestamp()
) as claim_result \gset
select pg_temp.assert_true(
  :'claim_result'::jsonb = '{"ok":true,"state":"claimed","idempotent":false}'::jsonb,
  'claim did not bind the command'
);
select public.research_checkout_activation_intent_claim_v1(
  '50000000-0000-4000-8000-000000000001', repeat('a',64),
  :'intent_id'::uuid,
  '60000000-0000-4000-8000-000000000001',
  :'cart_fingerprint', clock_timestamp()
) as claim_replay \gset
select pg_temp.assert_true(
  :'claim_replay'::jsonb = '{"ok":true,"state":"claimed","idempotent":true}'::jsonb,
  'same-command claim replay was not idempotent'
);
select public.research_checkout_activation_intent_claim_v1(
  '50000000-0000-4000-8000-000000000001', repeat('a',64),
  :'intent_id'::uuid,
  '60000000-0000-4000-8000-000000000099',
  :'cart_fingerprint', clock_timestamp()
) as claim_conflict \gset
select pg_temp.assert_true(
  :'claim_conflict'::jsonb = '{"ok":false,"code":"intent_conflict"}'::jsonb,
  'another command reused a claimed intent'
);

-- A claimed intent is a durable lease, not a timer-only hint. Mutable Product
-- Control, activation-head, and cart writes all refuse while it is claimed.
select pg_sleep(1.1);
do $claimed_guards$
begin
  begin
    update public.research_products set version = version + 1
    where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'product guard admitted a claimed write';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.research_product_variant_activation_heads
    set ledger_revision = (
      select r.ledger_revision
      from public.research_product_variant_activation_revisions r
      where r.sku = 'XR-ATOMIC-1' and r.product_state = 'held'
      order by r.ledger_revision desc limit 1
    ) where sku = 'XR-ATOMIC-1';
    raise exception 'head guard admitted a claimed write';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.research_cart_lines set quantity = 2
    where cart_id = (select id from public.research_carts
      where member_id = '50000000-0000-4000-8000-000000000001');
    raise exception 'cart guard admitted a claimed write';
  exception when sqlstate '55000' then null;
  end;
end
$claimed_guards$;

-- Provider latency has now crossed the original short lease. The same
-- pre-expiry claim may still settle, while a different command cannot.
select public.research_checkout_activation_intent_consume_v1(
  '50000000-0000-4000-8000-000000000001', repeat('a',64),
  :'intent_id'::uuid,
  '60000000-0000-4000-8000-000000000001',
  :'cart_fingerprint', clock_timestamp()
) as consume_result \gset
select pg_temp.assert_true(
  :'consume_result'::jsonb = '{"ok":true,"state":"consumed","idempotent":false}'::jsonb,
  'same claimed command could not consume after short-lease expiry'
);
select public.research_checkout_activation_intent_consume_v1(
  '50000000-0000-4000-8000-000000000001', repeat('a',64),
  :'intent_id'::uuid,
  '60000000-0000-4000-8000-000000000001',
  :'cart_fingerprint', clock_timestamp()
) as consume_replay \gset
select pg_temp.assert_true(
  :'consume_replay'::jsonb = '{"ok":true,"state":"consumed","idempotent":true}'::jsonb,
  'settlement replay was not idempotent'
);

-- Consumed releases the lease. Restore the live head for subsequent passes.
update public.research_product_variant_activation_heads
set ledger_revision = :held_revision where sku = 'XR-ATOMIC-1';
update public.research_product_variant_activation_heads
set ledger_revision = :live_revision where sku = 'XR-ATOMIC-1';

-- Create an unclaimed stale intent on a second exact cart. It must not be
-- recoverable by consume merely by presenting a command id.
set role service_role;
select public.research_cart_mutate_with_activation_v1(
  '50000000-0000-4000-8000-000000000002',
  'add', 'XR-ATOMIC-1', 1, 'one_time', null, clock_timestamp(), 10
) as second_add \gset
select public.research_checkout_activation_precharge_authorize_v1(
  '50000000-0000-4000-8000-000000000002',
  repeat('b',64), clock_timestamp(), 1
) as second_authorize \gset
reset role;
select :'second_authorize'::jsonb#>>'{authorization,intentId}' as second_intent,
       :'second_authorize'::jsonb#>>'{authorization,cartFingerprint}' as second_fingerprint \gset
select public.research_checkout_activation_intent_consume_v1(
  '50000000-0000-4000-8000-000000000002', repeat('b',64),
  :'second_intent'::uuid,
  '60000000-0000-4000-8000-000000000002',
  :'second_fingerprint', clock_timestamp()
) as live_unclaimed \gset
select pg_temp.assert_true(
  :'live_unclaimed'::jsonb = '{"ok":false,"code":"intent_conflict"}'::jsonb,
  'consume succeeded without a pre-provider claim'
);
select pg_sleep(1.1);
select public.research_checkout_activation_intent_consume_v1(
  '50000000-0000-4000-8000-000000000002', repeat('b',64),
  :'second_intent'::uuid,
  '60000000-0000-4000-8000-000000000002',
  :'second_fingerprint', clock_timestamp()
) as stale_unclaimed \gset
select pg_temp.assert_true(
  :'stale_unclaimed'::jsonb = '{"ok":false,"code":"intent_stale"}'::jsonb,
  'unclaimed stale intent was accepted'
);

-- Claim/cancel has the same post-expiry recovery for terminal pre-provider
-- compensation, and only for the already-bound command.
set role service_role;
select public.research_cart_mutate_with_activation_v1(
  '50000000-0000-4000-8000-000000000003',
  'add', 'XR-ATOMIC-1', 1, 'one_time', null, clock_timestamp(), 10
) as third_add \gset
select public.research_checkout_activation_precharge_authorize_v1(
  '50000000-0000-4000-8000-000000000003',
  repeat('c',64), clock_timestamp(), 1
) as third_authorize \gset
reset role;
select :'third_authorize'::jsonb#>>'{authorization,intentId}' as third_intent,
       :'third_authorize'::jsonb#>>'{authorization,cartFingerprint}' as third_fingerprint \gset
select public.research_checkout_activation_intent_claim_v1(
  '50000000-0000-4000-8000-000000000003', repeat('c',64),
  :'third_intent'::uuid,
  '60000000-0000-4000-8000-000000000003',
  :'third_fingerprint', clock_timestamp()
) as third_claim \gset
select pg_sleep(1.1);
select public.research_checkout_activation_intent_cancel_v1(
  '50000000-0000-4000-8000-000000000003', repeat('c',64),
  :'third_intent'::uuid,
  '60000000-0000-4000-8000-000000000003', clock_timestamp()
) as cancel_result \gset
select pg_temp.assert_true(
  :'cancel_result'::jsonb = '{"ok":true,"state":"cancelled","idempotent":false}'::jsonb,
  'claimed compensation could not cancel after short-lease expiry'
);

-- Append-only evidence cannot be rewritten or deleted.
do $immutable_revision$
begin
  begin
    update public.research_product_variant_activation_revisions
    set product_state = 'retired' where ledger_revision = (
      select r.ledger_revision
      from public.research_product_variant_activation_revisions r
      where r.sku = 'XR-ATOMIC-1' and r.product_state = 'live'
      order by r.ledger_revision desc limit 1
    );
    raise exception 'activation revision update succeeded';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.research_product_variant_activation_revisions
    where ledger_revision = (
      select r.ledger_revision
      from public.research_product_variant_activation_revisions r
      where r.sku = 'XR-ATOMIC-1' and r.product_state = 'live'
      order by r.ledger_revision desc limit 1
    );
    raise exception 'activation revision delete succeeded';
  exception when sqlstate '55000' then null;
  end;
end
$immutable_revision$;

select pg_temp.assert_true(
  (select count(*) = 3 from public.research_carts),
  'unexpected cart count after attack battery'
);

\echo 'PASS activation authority attack battery'
